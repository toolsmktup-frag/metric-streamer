// meta-whatsapp-send — envia mensagem via WhatsApp Cloud API (Meta).
// Suporta template (fora da janela 24h) e texto livre (sessão). No bypass, troca os
// valores genéricos pelos marketing_variables do template quando o caller não passa vars.
// Auth: service_role (chamada interna do wz-executor) OU usuário autenticado (front).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const GRAPH_VERSION = Deno.env.get('META_GRAPH_VERSION') || 'v22.0'

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

// Número internacional só com dígitos; assume DDI 55 (BR) quando ausente.
function normalizePhone(phone: string): string {
  let digits = String(phone || '').replace(/\D/g, '')
  if (digits.length >= 10 && digits.length <= 11 && !digits.startsWith('55')) digits = `55${digits}`
  return digits
}

function countBodyVars(components: any[]): number {
  const body = (components || []).find((c) => String(c?.type).toUpperCase() === 'BODY')
  if (!body?.text) return 0
  const all = String(body.text).match(/\{\{\d+\}\}/g) || []
  return new Set(all.map((m) => m.replace(/\{\{|\}\}/g, ''))).size
}

// Converte {1:..,2:..} ou ['a','b'] em array ordenado de tamanho n.
function orderedVars(source: unknown, n: number): string[] {
  const out: string[] = []
  if (Array.isArray(source)) {
    for (let i = 0; i < n; i++) out.push(String(source[i] ?? ''))
  } else if (source && typeof source === 'object') {
    const obj = source as Record<string, unknown>
    for (let i = 1; i <= n; i++) out.push(String(obj[String(i)] ?? ''))
  } else {
    for (let i = 0; i < n; i++) out.push('')
  }
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)
    const token = authHeader.slice('Bearer '.length)

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const isInternal = token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    let orgId: string | null = null
    if (!isInternal) {
      // modo usuário (front): valida JWT e resolve org
      const authClient = createClient(
        Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      )
      const { data: { user }, error: userErr } = await authClient.auth.getUser()
      if (userErr || !user) return json({ error: 'Unauthorized' }, 401)
      const { data: prof } = await supabase
        .from('user_profiles').select('organization_id').eq('id', user.id).single()
      orgId = prof?.organization_id ?? null
      if (!orgId) return json({ error: 'No organization for user' }, 403)
    }

    const body = await req.json()
    const { instance_id, phone } = body
    const templateName: string | undefined = body.template_name || body.templateName
    const text: string | undefined = body.text
    if (!instance_id || !phone) return json({ error: 'instance_id e phone são obrigatórios' }, 400)

    // Resolve a instância oficial (no modo interno não há filtro de org)
    let q = supabase.from('whatsapp_instances')
      .select('id, organization_id, channel, meta_phone_number_id, meta_access_token')
      .eq('id', instance_id).eq('channel', 'official')
    if (!isInternal) q = q.eq('organization_id', orgId!)
    const { data: instance, error: instErr } = await q.single()
    if (instErr || !instance) return json({ error: 'Instance not found' }, 404)
    if (!instance.meta_phone_number_id || !instance.meta_access_token) {
      return json({ error: 'Instância oficial sem credenciais Meta' }, 400)
    }
    const effectiveOrg = instance.organization_id

    const to = normalizePhone(phone)
    let payload: Record<string, unknown>
    let logBody = ''

    if (templateName) {
      // Carrega o template para descobrir nº de variáveis e os valores do bypass
      const { data: tpl } = await supabase
        .from('whatsapp_templates')
        .select('language, components, sample_variables, marketing_variables, strategy')
        .eq('organization_id', effectiveOrg)
        .eq('name', templateName)
        .maybeSingle()

      const language = body.language || tpl?.language || 'pt_BR'
      const n = tpl ? countBodyVars(tpl.components) : 0

      // Base = marketing_variables (bypass) ou sample_variables; o caller sobrescreve por chave.
      const mk = tpl?.marketing_variables as Record<string, string> | undefined
      const base = (mk && Object.keys(mk).length) ? mk : ((tpl?.sample_variables || {}) as Record<string, string>)
      const merged: Record<string, string> = base && typeof base === 'object' ? { ...base } : {}
      const ov = body.variables
      if (Array.isArray(ov)) {
        ov.forEach((v: string, i: number) => { if (v) merged[String(i + 1)] = String(v) })
      } else if (ov && typeof ov === 'object') {
        for (const [k, v] of Object.entries(ov)) if (v) merged[String(k)] = String(v)
      }
      const bodyParams = orderedVars(merged, n)

      const components: any[] = []
      if (bodyParams.length > 0) {
        components.push({ type: 'body', parameters: bodyParams.map((t) => ({ type: 'text', text: t })) })
      }
      // header dinâmico (se o caller fornecer)
      if (Array.isArray(body.header_variables) && body.header_variables.length > 0) {
        components.push({ type: 'header', parameters: body.header_variables.map((t: string) => ({ type: 'text', text: t })) })
      }

      payload = {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: language },
          ...(components.length > 0 ? { components } : {}),
        },
      }
      logBody = `[template:${templateName}] ${bodyParams.join(' | ')}`.trim()
    } else if (text) {
      payload = {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { preview_url: body.preview_url ?? true, body: text },
      }
      logBody = text
    } else {
      return json({ error: 'Informe template_name (com variables) ou text' }, 400)
    }

    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${instance.meta_phone_number_id}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${instance.meta_access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    )
    const data = await res.json()

    if (!res.ok) {
      console.error('[meta-whatsapp-send] Meta error:', JSON.stringify(data))
      // registra falha
      await supabase.from('whatsapp_messages').insert({
        organization_id: effectiveOrg, instance_id: instance.id, phone: to,
        body: logBody, message_type: 'text', direction: 'outbound', status: 'failed',
        payload_raw: data,
      })
      return json({ success: false, error: data?.error?.error_user_msg || data?.error?.message || 'Falha no envio', details: data?.error }, 400)
    }

    const messageId = data?.messages?.[0]?.id || null
    await supabase.from('whatsapp_messages').insert({
      organization_id: effectiveOrg, instance_id: instance.id, phone: to,
      body: logBody, message_type: 'text', direction: 'outbound', status: 'sent',
      message_id_external: messageId, payload_raw: data,
    })

    return json({ success: true, messageId })
  } catch (err) {
    console.error('meta-whatsapp-send error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
