const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EXPECTED_ENDPOINT = 'https://emfbocpmphtftqcezaib.supabase.co/functions/v1/track-event'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
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
