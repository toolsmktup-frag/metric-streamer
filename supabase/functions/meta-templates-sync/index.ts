// meta-templates-sync — puxa os message templates da WABA (Meta) para whatsapp_templates.
// Preserva sample_variables/marketing_variables locais (não são sobrescritos no upsert).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const GRAPH_VERSION = Deno.env.get('META_GRAPH_VERSION') || 'v22.0'

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

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

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: callerProfile } = await supabase
      .from('user_profiles').select('organization_id').eq('id', user.id).single()
    const orgId = callerProfile?.organization_id ?? null
    if (!orgId) return json({ error: 'No organization for user' }, 403)

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const instanceId = body.instance_id || new URL(req.url).searchParams.get('instance_id')

    // Resolve a instância oficial (por id ou a primeira da org)
    let q = supabase.from('whatsapp_instances')
      .select('id, meta_waba_id, meta_access_token')
      .eq('organization_id', orgId).eq('channel', 'official')
    if (instanceId) q = q.eq('id', instanceId)
    const { data: instance } = await q.limit(1).maybeSingle()

    if (!instance?.meta_waba_id || !instance?.meta_access_token) {
      return json({ error: 'Nenhuma instância oficial conectada (WABA/token ausentes)' }, 400)
    }

    // Pagina os templates da WABA
    const fields = 'name,status,language,category,parameter_format,components,id'
    let url: string | null =
      `https://graph.facebook.com/${GRAPH_VERSION}/${instance.meta_waba_id}/message_templates?fields=${fields}&limit=100`
    const fetched: any[] = []
    let pages = 0
    while (url && pages < 25) {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${instance.meta_access_token}` } })
      const data = await res.json()
      if (!res.ok) return json({ error: 'Falha ao buscar templates na Meta', details: data?.error || data }, 400)
      if (Array.isArray(data?.data)) fetched.push(...data.data)
      url = data?.paging?.next || null
      pages++
    }

    const now = new Date().toISOString()
    // Upsert SEM marketing_variables/sample_variables (preserva valores locais do bypass)
    const rows = fetched.map((t) => ({
      organization_id: orgId,
      instance_id: instance.id,
      meta_template_id: t.id || null,
      name: t.name,
      language: t.language || 'pt_BR',
      category: t.category || 'UTILITY',
      status: t.status || 'PENDING',
      parameter_format: t.parameter_format || 'POSITIONAL',
      components: t.components || [],
      fetched_at: now,
      updated_at: now,
    }))

    if (rows.length > 0) {
      const { error } = await supabase
        .from('whatsapp_templates')
        .upsert(rows, { onConflict: 'organization_id,name,language' })
      if (error) return json({ error: error.message }, 500)
    }

    return json({ synced: rows.length, instance_id: instance.id })
  } catch (err) {
    console.error('meta-templates-sync error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
