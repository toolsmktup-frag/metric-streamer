import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EXPECTED_ENDPOINT = 'https://emfbocpmphtftqcezaib.supabase.co/functions/v1/track-event'

// 🔒 Bloqueia hosts internos/privados para mitigar SSRF
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '')
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return true
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const a = +m[1], b = +m[2]
    if (a === 0 || a === 127 || a === 10) return true
    if (a === 192 && b === 168) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 169 && b === 254) return true // link-local + metadata de nuvem
  }
  return false
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 🔒 Exige usuário autenticado (ferramenta interna chamada pela UI)
    const authHeader = req.headers.get('Authorization') || ''
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authErr } = await authClient.auth.getUser()
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { url, funnel_id, stage_id } = await req.json()

    if (!url || !stage_id) {
      return new Response(JSON.stringify({ error: 'url and stage_id are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Normalize URL
    let targetUrl = url.trim()
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = 'https://' + targetUrl
    }

    // 🔒 Valida destino: só http/https público, bloqueia IPs internos/privados (anti-SSRF)
    let parsedTarget: URL
    try {
      parsedTarget = new URL(targetUrl)
    } catch {
      return new Response(JSON.stringify({ error: 'invalid url' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!/^https?:$/.test(parsedTarget.protocol) || isBlockedHost(parsedTarget.hostname)) {
      return new Response(JSON.stringify({ error: 'blocked url' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let html: string
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      const res = await fetch(targetUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'MetricStreamer-SnippetVerifier/1.0' },
      })
      clearTimeout(timeout)
      if (!res.ok) {
        return new Response(JSON.stringify({
          error: `page_unreachable`,
          status_code: res.status,
          checks: null,
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      html = await res.text()
    } catch (e) {
      return new Response(JSON.stringify({
        error: 'page_unreachable',
        message: e instanceof Error ? e.message : 'timeout or network error',
        checks: null,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Find all script tags referencing tracker.js
    const scriptRegex = /<script[^>]*src=["'][^"']*tracker\.js[^"']*["'][^>]*>/gi
    const matches = [...html.matchAll(scriptRegex)]

    if (matches.length === 0) {
      return new Response(JSON.stringify({
        error: null,
        checks: {
          found: false,
          endpoint_ok: false,
          stage_ok: false,
          funnel_ok: false,
          in_head: false,
        },
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const tag = matches[0][0]

    const getAttr = (t: string, name: string): string | null => {
      const m = t.match(new RegExp(`${name}=["']([^"']*)["']`))
      return m ? m[1] : null
    }

    const dataEndpoint = getAttr(tag, 'data-endpoint')
    const dataStageId = getAttr(tag, 'data-stage-id')
    const dataFunnelId = getAttr(tag, 'data-funnel-id')

    // Check if in <head>
    const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)
    const inHead = headMatch ? headMatch[1].includes(tag) : false

    const checks = {
      found: true,
      endpoint_ok: dataEndpoint === EXPECTED_ENDPOINT,
      stage_ok: dataStageId === stage_id,
      funnel_ok: funnel_id ? dataFunnelId === funnel_id : true,
      in_head: inHead,
      details: {
        endpoint: dataEndpoint,
        stage_id: dataStageId,
        funnel_id: dataFunnelId,
      },
    }

    return new Response(JSON.stringify({ error: null, checks }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
