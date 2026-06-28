// meta-templates-create — submete um template à WABA (Meta) e salva em whatsapp_templates.
// Bypass: força category=UTILITY e guarda marketing_variables p/ uso no disparo.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const GRAPH_VERSION = Deno.env.get('META_GRAPH_VERSION') || 'v22.0'

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

// Reordena variáveis para 1..n sequencial (porta de template.service.ts)
function renumberVariables(text: string): string {
  const matches = text.match(/\{\{([^}]+)\}\}/g) || []
  if (matches.length === 0) return text
  const seen = new Set<string>()
  const uniq: string[] = []
  for (const m of matches) {
    const v = m.replace(/\{\{|\}\}/g, '')
    if (!seen.has(v)) { seen.add(v); uniq.push(v) }
  }
  const mapping: Record<string, number> = {}
  uniq.forEach((v, i) => { mapping[v] = i + 1 })
  let result = text
  for (const oldVar of Object.keys(mapping).sort((a, b) => b.length - a.length)) {
    result = result.replaceAll(`{{${oldVar}}}`, `{{${mapping[oldVar]}}}`)
  }
  return result
}

function countVars(text: string): number {
  const all = text.match(/\{\{\d+\}\}/g) || []
  return new Set(all.map((m) => m.replace(/\{\{|\}\}/g, ''))).size
}

function sampleList(sampleVars: Record<string, string> | undefined, n: number): string[] {
  const out: string[] = []
  for (let i = 1; i <= n; i++) out.push(String(sampleVars?.[String(i)] ?? `Exemplo ${i}`))
  return out
}

function buildComponents(input: any): any[] {
  const components: any[] = []
  const sample = input.sample_variables || {}

  // HEADER (TEXT)
  const headerText = typeof input.header === 'string' ? input.header : input.header?.text
  if (headerText && String(headerText).trim()) {
    const text = renumberVariables(String(headerText).trim().replace(/[\n\r*_~`]/g, ' ').replace(/\s+/g, ' '))
    const comp: any = { type: 'HEADER', format: 'TEXT', text }
    const n = countVars(text)
    if (n > 0) comp.example = { header_text: sampleList(sample, n) }
    components.push(comp)
  }

  // BODY
  const bodyText = renumberVariables(String(input.content || input.body || '').trim())
  if (!bodyText) throw new Error('content (corpo do template) é obrigatório')
  const bodyComp: any = { type: 'BODY', text: bodyText }
  const bn = countVars(bodyText)
  if (bn > 0) bodyComp.example = { body_text: [sampleList(sample, bn)] }
  components.push(bodyComp)

  // FOOTER
  const footerText = typeof input.footer === 'string' ? input.footer : input.footer?.text
  if (footerText && String(footerText).trim()) {
    components.push({ type: 'FOOTER', text: String(footerText).trim() })
  }

  // BUTTONS (URL / QUICK_REPLY / PHONE_NUMBER)
  if (Array.isArray(input.buttons) && input.buttons.length) {
    const btns = input.buttons.map((b: any) => {
      if (b.type === 'URL') return { type: 'URL', text: b.text, url: b.url }
      if (b.type === 'QUICK_REPLY') return { type: 'QUICK_REPLY', text: b.text }
      if (b.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone_number }
      return null
    }).filter(Boolean)
    if (btns.length) components.push({ type: 'BUTTONS', buttons: btns })
  }

  return components
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: userErr } = await authClient.auth.getUser()
    if (userErr || !user) return json({ error: 'Unauthorized' }, 401)

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: callerProfile } = await supabase
      .from('user_profiles').select('organization_id').eq('id', user.id).single()
    const orgId = callerProfile?.organization_id ?? null
    if (!orgId) return json({ error: 'No organization for user' }, 403)

    const input = await req.json()
    const name: string = (input.name || '').trim()
    const language: string = input.language || 'pt_BR'
    const strategy: string = input.strategy || 'bypass'
    if (!name) return json({ error: 'name é obrigatório' }, 400)
    if (!/^[a-z0-9_]+$/.test(name)) {
      return json({ error: 'name deve conter apenas letras minúsculas, números e _ (regra da Meta)' }, 400)
    }

    // Bypass/utility => UTILITY; marketing => MARKETING
    const category = strategy === 'marketing'
      ? 'MARKETING'
      : (input.category && strategy !== 'bypass' ? input.category : 'UTILITY')

    // Resolve instância oficial
    let q = supabase.from('whatsapp_instances')
      .select('id, meta_waba_id, meta_access_token')
      .eq('organization_id', orgId).eq('channel', 'official')
    if (input.instance_id) q = q.eq('id', input.instance_id)
    const { data: instance } = await q.limit(1).maybeSingle()
    if (!instance?.meta_waba_id || !instance?.meta_access_token) {
      return json({ error: 'Nenhuma instância oficial conectada (WABA/token ausentes)' }, 400)
    }

    let components: any[]
    try {
      components = buildComponents(input)
    } catch (e) {
      return json({ error: (e as Error).message }, 400)
    }

    const metaPayload = {
      name,
      language,
      category,
      parameter_format: 'POSITIONAL',
      components,
    }

    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${instance.meta_waba_id}/message_templates`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${instance.meta_access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(metaPayload),
      },
    )
    const result = await res.json()
    if (!res.ok) {
      console.error('[meta-templates-create] Meta error:', JSON.stringify(result))
      return json({ error: result?.error?.error_user_msg || result?.error?.message || 'Falha ao criar template', details: result?.error }, 400)
    }

    // Persiste localmente (com marketing_variables p/ o bypass no disparo)
    const now = new Date().toISOString()
    const { data: saved, error: saveErr } = await supabase
      .from('whatsapp_templates')
      .upsert({
        organization_id: orgId,
        instance_id: instance.id,
        meta_template_id: result.id || null,
        name,
        language,
        category,
        status: result.status || 'PENDING',
        parameter_format: 'POSITIONAL',
        strategy,
        components,
        sample_variables: input.sample_variables || {},
        marketing_variables: input.marketing_variables || {},
        updated_at: now,
      }, { onConflict: 'organization_id,name,language' })
      .select('*')
      .single()
    if (saveErr) console.error('[meta-templates-create] save error:', saveErr.message)

    return json({ success: true, meta: result, template: saved })
  } catch (err) {
    console.error('meta-templates-create error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
