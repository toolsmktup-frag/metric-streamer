// v1.0.6 - redeploy all functions for matheuscolombo.uazapi.com migration
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const normalizeBaseUrl = (rawUrl?: string | null, fallbackUrl?: string | null) => {
  const candidate = (rawUrl || fallbackUrl || '').trim()
  if (!candidate) return ''

  const withoutTrailingSlash = candidate.replace(/\/+$/, '')

  return withoutTrailingSlash.replace(/\/instance(?:\/.*)?$/i, '')
}

const buildUazUrl = (baseUrl: string, path: string) => {
  const normalizedBase = baseUrl.replace(/\/+$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${normalizedBase}${normalizedPath}`
}

const readJsonSafely = async (response: Response) => {
  const text = await response.text()
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userErr } = await authClient.auth.getUser()
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const url = new URL(req.url)
    let action = url.searchParams.get('action')
    let instanceId = url.searchParams.get('instance_id')
    let body: any = {}

    if (req.method === 'POST') {
      body = await req.json()
      action = action || body.action
      instanceId = instanceId || body.instance_id
    }

    if (!action) {
      return new Response(JSON.stringify({ error: 'action required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'create_instance') {
      const instanceName = body.instance_name
      if (!instanceName) {
        return new Response(JSON.stringify({ error: 'instance_name required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const UAZAPI_BASE_URL = Deno.env.get('UAZAPI_BASE_URL')
      const UAZAPI_TOKEN = Deno.env.get('UAZAPI_TOKEN')
      if (!UAZAPI_BASE_URL || !UAZAPI_TOKEN) {
        return new Response(JSON.stringify({ error: 'UAZAPI credentials not configured' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const uazBaseUrl = normalizeBaseUrl(UAZAPI_BASE_URL)
      if (!uazBaseUrl.startsWith('http')) {
        return new Response(JSON.stringify({ error: `UAZAPI_BASE_URL inválida: "${UAZAPI_BASE_URL}"` }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const userId = user.id
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('organization_id')
        .eq('id', userId)
        .single()

      if (!profile?.organization_id) {
        return new Response(JSON.stringify({ error: 'Organization not found' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const sanitizedName = instanceName.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
      const uazCreateRes = await fetch(buildUazUrl(uazBaseUrl, '/instance/init'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'admintoken': UAZAPI_TOKEN,
        },
        body: JSON.stringify({ name: sanitizedName }),
      })
      const uazCreateData = await readJsonSafely(uazCreateRes)
      console.log('[create_instance] UAZAPI response:', JSON.stringify(uazCreateData))

      if (!uazCreateRes.ok) {
        return new Response(JSON.stringify({ error: 'Failed to create UAZAPI instance', details: uazCreateData }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const instanceApiToken = uazCreateData?.instance?.token || uazCreateData?.token || uazCreateData?.instance?.apitoken || ''

      const { data: newInstance, error: insertErr } = await supabase
        .from('whatsapp_instances')
        .insert({
          organization_id: profile.organization_id,
          instance_name: instanceName,
          api_url: uazBaseUrl,
          api_token: instanceApiToken,
          status: 'connecting',
        })
        .select('*')
        .single()

      if (insertErr) {
        return new Response(JSON.stringify({ error: insertErr.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Auto-grant access to the creator so non-admin users (vendedoras) see the instance they just created
      try {
        const { error: accessErr } = await supabase
          .from('whatsapp_instance_access')
          .insert({
            user_id: user.id,
            instance_id: newInstance.id,
            organization_id: profile.organization_id,
          })
        if (accessErr) console.error('[create_instance] auto-grant access failed:', accessErr.message)
      } catch (e) {
        console.error('[create_instance] auto-grant access exception:', (e as Error).message)
      }

      const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/uazapi-webhook`
      try {
        await fetch(buildUazUrl(uazBaseUrl, '/webhook'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'token': instanceApiToken },
          body: JSON.stringify({ url: webhookUrl, enabled: true, events: ['messages', 'messages_update', 'connection'] }),
        })
      } catch (e) {
        console.error('Webhook config failed:', e.message)
      }

      let qrcode = null
      let paircode = null
      try {
        const connectRes = await fetch(buildUazUrl(uazBaseUrl, '/instance/connect'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'token': instanceApiToken },
          body: JSON.stringify({}),
        })
        const connectData = await readJsonSafely(connectRes)
        console.log('[create_instance] connect response:', JSON.stringify(connectData))
        qrcode = connectData?.qrcode || connectData?.base64 || connectData?.instance?.qrcode || null
        paircode = connectData?.paircode || connectData?.instance?.paircode || null
      } catch (e) {
        console.error('Connect after create failed:', e.message)
      }

      return new Response(JSON.stringify({
        instance: newInstance,
        qrcode,
        paircode,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'manual_status') {
      const manualApiUrl = normalizeBaseUrl(body.api_url)
      const manualApiToken = body.api_key

      if (!manualApiUrl || !manualApiUrl.startsWith('http') || !manualApiToken) {
        return new Response(JSON.stringify({ error: 'api_url and api_key required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const res = await fetch(buildUazUrl(manualApiUrl, '/instance/status'), {
        headers: { 'Content-Type': 'application/json', 'token': manualApiToken },
      })
      const raw = await readJsonSafely(res)
      const rawStatus = raw?.status || raw?.state || raw?.instance?.status || raw?.instance?.state || raw?.data?.status || raw?.data?.state
      const isConnected = rawStatus === 'connected' || rawStatus === 'open' || raw?.connected === true || raw?.status?.connected === true

      return new Response(JSON.stringify({
        raw,
        processed: {
          status: isConnected ? 'connected' : (rawStatus || 'disconnected'),
          phone_number: raw?.phone || raw?.number || raw?.instance?.phone || raw?.instance?.owner || raw?.user?.id?.replace('@s.whatsapp.net', '') || raw?.status?.jid?.split(':')?.[0] || null,
          profile_pic_url: raw?.profilePicUrl || raw?.instance?.profilePicUrl || raw?.user?.profilePictureUrl || null,
        },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!instanceId) {
      return new Response(JSON.stringify({ error: 'instance_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: instance, error: instErr } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('id', instanceId)
      .single()

    if (instErr || !instance) {
      return new Response(JSON.stringify({ error: 'Instance not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const uazBaseUrl = normalizeBaseUrl(instance.api_url, Deno.env.get('UAZAPI_BASE_URL'))
    const apiToken = instance.api_token

    if (!uazBaseUrl || !uazBaseUrl.startsWith('http')) {
      return new Response(JSON.stringify({ error: `URL da API inválida: "${instance.api_url}". Deve apontar para a base da UAZAPI.` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (instance.api_url !== uazBaseUrl) {
      await supabase
        .from('whatsapp_instances')
        .update({ api_url: uazBaseUrl, updated_at: new Date().toISOString() })
        .eq('id', instanceId)
    }

    console.log('[whatsapp-instance] action:', action, 'instanceId:', instanceId, 'uazBaseUrl:', uazBaseUrl)

    const uazHeaders = {
      'Content-Type': 'application/json',
      'token': apiToken,
    }

    let result: any = null

    switch (action) {
      case 'status': {
        const res = await fetch(buildUazUrl(uazBaseUrl, '/instance/status'), { headers: uazHeaders })
        result = await readJsonSafely(res)

        let newStatus = 'disconnected'
        if (result?.instance?.status === 'connected' || result?.instance?.state === 'open') {
          newStatus = 'connected'
        } else if (result?.status?.connected === true || result?.connected === true) {
          newStatus = 'connected'
        } else if (result?.instance?.status) {
          newStatus = result.instance.status
        }

        const profileName = result?.instance?.profileName || result?.instance?.pushName || null
        const profilePicUrl = result?.instance?.profilePicUrl || null
        const phoneNumber = result?.instance?.phone || result?.instance?.owner || result?.status?.jid?.split(':')?.[0] || instance.phone_number

        const finalDisplayName = profileName || instance.display_name
        const finalProfilePic = profilePicUrl || instance.profile_pic_url
        const finalPhone = phoneNumber || instance.phone_number

        await supabase.from('whatsapp_instances').update({
          status: newStatus,
          display_name: finalDisplayName,
          profile_pic_url: finalProfilePic,
          phone_number: finalPhone,
          updated_at: new Date().toISOString(),
        }).eq('id', instanceId)

        const statusQrCode = result?.instance?.qrcode || result?.qrcode || null
        const statusPairCode = result?.instance?.paircode || result?.paircode || null

        result = {
          raw: result,
          qrcode: statusQrCode,
          paircode: statusPairCode,
          processed: {
            status: newStatus,
            display_name: finalDisplayName,
            profile_pic_url: finalProfilePic,
            phone_number: finalPhone,
          }
        }

        break
      }

      case 'connect': {
        const connectBody: any = {}
        if (body.phone) connectBody.phone = body.phone

        const connectUrl = buildUazUrl(uazBaseUrl, '/instance/connect')
        const res = await fetch(connectUrl, {
          method: 'POST',
          headers: uazHeaders,
          body: JSON.stringify(connectBody),
        })
        const rawConnect = await readJsonSafely(res)
        console.log('[UAZAPI connect] raw response:', JSON.stringify(rawConnect))

        const qrcode = rawConnect?.qrcode || rawConnect?.base64 || rawConnect?.instance?.qrcode || rawConnect?.data?.qrcode || null
        const paircode = rawConnect?.paircode || rawConnect?.instance?.paircode || rawConnect?.data?.paircode || null

        console.log('[UAZAPI connect] extracted qrcode:', qrcode ? `${String(qrcode).substring(0, 50)}...` : 'null')
        console.log('[UAZAPI connect] extracted paircode:', paircode)

        result = {
          raw: rawConnect,
          qrcode,
          paircode,
        }

        await supabase.from('whatsapp_instances').update({
          status: 'connecting',
          updated_at: new Date().toISOString(),
        }).eq('id', instanceId)

        const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/uazapi-webhook`
        try {
          await fetch(buildUazUrl(uazBaseUrl, '/webhook'), {
            method: 'POST',
            headers: uazHeaders,
            body: JSON.stringify({
              url: webhookUrl,
              enabled: true,
              events: ['messages', 'messages_update', 'connection'],
            }),
          })
          console.log('Webhook auto-configured:', webhookUrl)
        } catch (e) {
          console.error('Failed to auto-configure webhook:', e.message)
        }

        break
      }

      case 'disconnect': {
        const res = await fetch(buildUazUrl(uazBaseUrl, '/instance/disconnect'), {
          method: 'POST',
          headers: uazHeaders,
        })
        result = await readJsonSafely(res)

        await supabase.from('whatsapp_instances').update({
          status: 'disconnected',
          updated_at: new Date().toISOString(),
        }).eq('id', instanceId)

        break
      }

      case 'update_name': {
        if (!body.name) {
          return new Response(JSON.stringify({ error: 'name required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        const res = await fetch(buildUazUrl(uazBaseUrl, '/profile/name'), {
          method: 'POST',
          headers: uazHeaders,
          body: JSON.stringify({ name: body.name }),
        })
        result = await readJsonSafely(res)

        await supabase.from('whatsapp_instances').update({
          display_name: body.name,
          updated_at: new Date().toISOString(),
        }).eq('id', instanceId)

        break
      }

      case 'update_image': {
        if (!body.image) {
          return new Response(JSON.stringify({ error: 'image required (URL, base64, or "remove")' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        const res = await fetch(buildUazUrl(uazBaseUrl, '/profile/image'), {
          method: 'POST',
          headers: uazHeaders,
          body: JSON.stringify({ image: body.image }),
        })
        result = await readJsonSafely(res)
        break
      }

      case 'get_privacy': {
        const res = await fetch(buildUazUrl(uazBaseUrl, '/instance/privacy'), { headers: uazHeaders })
        result = await readJsonSafely(res)
        break
      }

      case 'set_privacy': {
        const res = await fetch(buildUazUrl(uazBaseUrl, '/instance/privacy'), {
          method: 'POST',
          headers: uazHeaders,
          body: JSON.stringify(body.settings || {}),
        })
        result = await readJsonSafely(res)
        break
      }

      case 'set_presence': {
        const res = await fetch(buildUazUrl(uazBaseUrl, '/instance/presence'), {
          method: 'POST',
          headers: uazHeaders,
          body: JSON.stringify({ presence: body.presence || 'available' }),
        })
        result = await readJsonSafely(res)
        break
      }

      case 'delete': {
        try {
          await fetch(buildUazUrl(uazBaseUrl, '/instance'), {
            method: 'DELETE',
            headers: uazHeaders,
          })
        } catch (e) {
          console.log('UAZAPI delete failed (may not exist):', e.message)
        }

        const { error: delErr } = await supabase
          .from('whatsapp_instances')
          .delete()
          .eq('id', instanceId)

        if (delErr) throw delErr

        result = { success: true, message: 'Instance deleted' }
        break
      }

      case 'update_instance_name': {
        if (!body.name) {
          return new Response(JSON.stringify({ error: 'name required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        const res = await fetch(buildUazUrl(uazBaseUrl, '/instance/updateInstanceName'), {
          method: 'POST',
          headers: uazHeaders,
          body: JSON.stringify({ name: body.name }),
        })
        result = await readJsonSafely(res)

        await supabase.from('whatsapp_instances').update({
          instance_name: body.name,
          updated_at: new Date().toISOString(),
        }).eq('id', instanceId)

        break
      }

      case 'set_webhook': {
        const webhookUrl = body.url || `${Deno.env.get('SUPABASE_URL')}/functions/v1/uazapi-webhook`
        const events = body.events || ['messages', 'messages_update', 'connection']

        const res = await fetch(buildUazUrl(uazBaseUrl, '/webhook'), {
          method: 'POST',
          headers: uazHeaders,
          body: JSON.stringify({
            url: webhookUrl,
            enabled: true,
            events,
          }),
        })
        result = await readJsonSafely(res)

        await supabase.from('whatsapp_instances').update({
          webhook_url: webhookUrl,
          updated_at: new Date().toISOString(),
        }).eq('id', instanceId)

        break
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('whatsapp-instance error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})