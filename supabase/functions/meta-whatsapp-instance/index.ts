// meta-whatsapp-instance — conecta/valida números via WhatsApp Business Cloud API (Meta).
// Espelha o padrão de auth/CORS de whatsapp-instance (UazAPI), mas o canal é "official".
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const GRAPH_VERSION = Deno.env.get('META_GRAPH_VERSION') || 'v22.0'
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

async function readJsonSafely(res: Response) {
  const text = await res.text()
  if (!text) return null
  try { return JSON.parse(text) } catch { return { raw: text } }
}

// Valida o Phone Number ID + token na Graph API. Retorna metadados do número.
async function validatePhoneNumber(phoneNumberId: string, accessToken: string) {
  const res = await fetch(
    `${GRAPH}/${phoneNumberId}?fields=verified_name,display_phone_number,quality_rating,code_verification_status`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  const data = await readJsonSafely(res)
  return { ok: res.ok, status: res.status, data }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: userErr } = await authClient.auth.getUser()
    if (userErr || !user) return json({ error: 'Unauthorized' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: callerProfile } = await supabase
      .from('user_profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()
    const orgId = callerProfile?.organization_id ?? null
    if (!orgId) return json({ error: 'No organization for user' }, 403)

    const url = new URL(req.url)
    let action = url.searchParams.get('action')
    let instanceId = url.searchParams.get('instance_id')
    let body: any = {}
    if (req.method === 'POST') {
      body = await req.json().catch(() => ({}))
      action = action || body.action
      instanceId = instanceId || body.instance_id
    }
    if (!action) return json({ error: 'action required' }, 400)

    // ---- connect: cria/atualiza uma instância oficial validando as credenciais ----
    if (action === 'connect') {
      const instanceName: string = (body.instance_name || '').trim()
      const wabaId: string = (body.waba_id || body.meta_waba_id || '').trim()
      const phoneNumberId: string = (body.phone_number_id || body.meta_phone_number_id || '').trim()
      const accessToken: string = (body.access_token || body.meta_access_token || '').trim()
      const appSecret: string = (body.app_secret || '').trim()
      let verifyToken: string = (body.verify_token || '').trim()

      if (!instanceName || !wabaId || !phoneNumberId || !accessToken) {
        return json({ error: 'instance_name, waba_id, phone_number_id e access_token são obrigatórios' }, 400)
      }

      // Valida o número na Graph API antes de salvar
      const check = await validatePhoneNumber(phoneNumberId, accessToken)
      if (!check.ok) {
        return json({
          error: 'Falha ao validar credenciais na Meta. Verifique Phone Number ID e Access Token.',
          details: check.data,
        }, 400)
      }

      const displayPhone = check.data?.display_phone_number || null
      const verifiedName = check.data?.verified_name || null

      // verify_token: gera um se não informado (usado no painel de webhook da Meta)
      if (!verifyToken) verifyToken = crypto.randomUUID().replace(/-/g, '')

      // Já existe instância oficial com este phone_number_id nesta org? Atualiza; senão cria.
      const { data: existing } = await supabase
        .from('whatsapp_instances')
        .select('id')
        .eq('organization_id', orgId)
        .eq('meta_phone_number_id', phoneNumberId)
        .maybeSingle()

      const row = {
        organization_id: orgId,
        instance_name: instanceName,
        channel: 'official',
        status: 'connected',
        phone_number: displayPhone,
        display_name: verifiedName,
        meta_waba_id: wabaId,
        meta_phone_number_id: phoneNumberId,
        meta_access_token: accessToken,
        meta_app_secret: appSecret || null,
        meta_verify_token: verifyToken,
        updated_at: new Date().toISOString(),
      }

      let instance: any
      if (existing?.id) {
        const { data, error } = await supabase
          .from('whatsapp_instances')
          .update(row)
          .eq('id', existing.id)
          .select('*')
          .single()
        if (error) return json({ error: error.message }, 500)
        instance = data
      } else {
        const { data, error } = await supabase
          .from('whatsapp_instances')
          .insert(row)
          .select('*')
          .single()
        if (error) return json({ error: error.message }, 500)
        instance = data

        // Auto-grant access ao criador + admins/gestores da org (igual ao fluxo UazAPI)
        try {
          const { data: orgAdmins } = await supabase
            .from('user_profiles')
            .select('id')
            .eq('organization_id', orgId)
            .in('role', ['admin', 'gestor'])
          const ids = new Set<string>([user.id])
          for (const a of orgAdmins || []) ids.add((a as any).id)
          const accessRows = Array.from(ids).map((uid) => ({
            user_id: uid, instance_id: instance.id, organization_id: orgId,
          }))
          await supabase
            .from('whatsapp_instance_access')
            .upsert(accessRows, { onConflict: 'user_id,instance_id', ignoreDuplicates: true })
        } catch (e) {
          console.error('[meta-whatsapp-instance] auto-grant access failed:', (e as Error).message)
        }
      }

      // Dados para o usuário configurar o webhook no painel da Meta (não há API p/ isso)
      const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/meta-whatsapp-webhook`

      // não devolve o token de acesso em texto puro
      const { meta_access_token: _omit, ...safeInstance } = instance
      return json({
        instance: safeInstance,
        meta: { verified_name: verifiedName, display_phone_number: displayPhone, quality_rating: check.data?.quality_rating },
        webhook: { url: webhookUrl, verify_token: verifyToken },
      })
    }

    // As ações abaixo exigem instance_id de uma instância oficial da própria org
    if (!instanceId) return json({ error: 'instance_id required' }, 400)
    const { data: instance, error: instErr } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('id', instanceId)
      .eq('organization_id', orgId)
      .eq('channel', 'official')
      .single()
    if (instErr || !instance) return json({ error: 'Instance not found' }, 404)

    if (action === 'status' || action === 'verify') {
      const check = await validatePhoneNumber(instance.meta_phone_number_id, instance.meta_access_token)
      const newStatus = check.ok ? 'connected' : 'disconnected'
      await supabase.from('whatsapp_instances').update({
        status: newStatus,
        phone_number: check.data?.display_phone_number || instance.phone_number,
        display_name: check.data?.verified_name || instance.display_name,
        updated_at: new Date().toISOString(),
      }).eq('id', instanceId)
      return json({ processed: { status: newStatus, quality_rating: check.data?.quality_rating || null }, raw: check.data })
    }

    if (action === 'delete') {
      const { error: delErr } = await supabase
        .from('whatsapp_instances')
        .delete()
        .eq('id', instanceId)
        .eq('organization_id', orgId)
      if (delErr) return json({ error: delErr.message }, 500)
      return json({ success: true })
    }

    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (err) {
    console.error('meta-whatsapp-instance error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
