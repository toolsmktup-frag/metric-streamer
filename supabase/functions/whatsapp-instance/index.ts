// v1.0.3 - use service role for DB ops
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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

    // Auth client just for user validation
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

    // Service role client for DB operations (bypasses RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Parse action from query or body
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

    // === CREATE INSTANCE (no instance_id needed) ===
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

      // Get user org_id
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

      // 1. Create instance on UAZAPI
      const sanitizedName = instanceName.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
      const uazCreateRes = await fetch(`${UAZAPI_BASE_URL}/instance/init`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'admintoken': UAZAPI_TOKEN,
        },
        body: JSON.stringify({ name: sanitizedName }),
      })
      const uazCreateData = await uazCreateRes.json()
      console.log('[create_instance] UAZAPI response:', JSON.stringify(uazCreateData))

      if (!uazCreateRes.ok) {
        return new Response(JSON.stringify({ error: 'Failed to create UAZAPI instance', details: uazCreateData }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Extract instance URL and token from UAZAPI response
      const instanceApiUrl = uazCreateData?.instance?.instanceUrl || uazCreateData?.instanceUrl || `${UAZAPI_BASE_URL}/instance/${sanitizedName}`
      const instanceApiToken = uazCreateData?.instance?.token || uazCreateData?.token || uazCreateData?.instance?.apitoken || ''

      // 2. Save to database
      const { data: newInstance, error: insertErr } = await supabase
        .from('whatsapp_instances')
        .insert({
          organization_id: profile.organization_id,
          instance_name: instanceName,
          api_url: instanceApiUrl.replace(/\/$/, ''),
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

      // 3. Configure webhook
      const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/uazapi-webhook`
      try {
        await fetch(`${instanceApiUrl}/webhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'token': instanceApiToken },
          body: JSON.stringify({ url: webhookUrl, enabled: true, events: ['messages', 'messages_update', 'connection'] }),
        })
      } catch (e) {
        console.error('Webhook config failed:', e.message)
      }

      // 4. Connect to get QR code
      let qrcode = null
      let paircode = null
      try {
        const connectRes = await fetch(`${instanceApiUrl}/instance/connect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'token': instanceApiToken },
          body: JSON.stringify({}),
        })
        const connectData = await connectRes.json()
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

    // All other actions require instance_id
    if (!instanceId) {
      return new Response(JSON.stringify({ error: 'instance_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get instance
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

    const apiUrl = instance.api_url
    const apiToken = instance.api_token

    // Validate api_url is a proper URL
    if (!apiUrl || !apiUrl.startsWith('http')) {
      return new Response(JSON.stringify({ error: `URL da API inválida: "${apiUrl}". Deve começar com https://` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const uazHeaders = {
      'Content-Type': 'application/json',
      'token': apiToken,
    }

    let result: any = null

    switch (action) {
      // GET /instance/status
      case 'status': {
        const res = await fetch(`${apiUrl}/instance/status`, { headers: uazHeaders })
        result = await res.json()
        
        // Detect real status - UAZAPI can return various formats
        let newStatus = 'disconnected'
        if (result?.instance?.status === 'connected' || result?.instance?.state === 'open') {
          newStatus = 'connected'
        } else if (result?.status?.connected === true) {
          newStatus = 'connected'
        } else if (result?.instance?.status) {
          newStatus = result.instance.status
        }
        
        const profileName = result?.instance?.profileName || result?.instance?.pushName || null
        const profilePicUrl = result?.instance?.profilePicUrl || null
        const phoneNumber = result?.instance?.phone || instance.phone_number
        
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
        
        result = {
          raw: result,
          processed: {
            status: newStatus,
            display_name: finalDisplayName,
            profile_pic_url: finalProfilePic,
            phone_number: finalPhone,
          }
        }
        
        break
      }

      // POST /instance/connect
      case 'connect': {
        const connectBody: any = {}
        if (body.phone) connectBody.phone = body.phone
        
        const res = await fetch(`${apiUrl}/instance/connect`, {
          method: 'POST',
          headers: uazHeaders,
          body: JSON.stringify(connectBody),
        })
        const rawConnect = await res.json()
        console.log('[UAZAPI connect] raw response:', JSON.stringify(rawConnect))
        
        // Extract qrcode/paircode from various possible response structures
        const qrcode = rawConnect?.qrcode || rawConnect?.base64 || rawConnect?.instance?.qrcode || rawConnect?.data?.qrcode || null
        const paircode = rawConnect?.paircode || rawConnect?.instance?.paircode || rawConnect?.data?.paircode || null
        
        console.log('[UAZAPI connect] extracted qrcode:', qrcode ? `${String(qrcode).substring(0, 50)}...` : 'null')
        console.log('[UAZAPI connect] extracted paircode:', paircode)
        
        result = {
          raw: rawConnect,
          qrcode,
          paircode,
        }
        
        // Update status
        await supabase.from('whatsapp_instances').update({
          status: 'connecting',
          updated_at: new Date().toISOString(),
        }).eq('id', instanceId)

        // Auto-configure webhook after connect (UAZAPI v2)
        const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/uazapi-webhook`
        try {
          await fetch(`${apiUrl}/webhook`, {
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

      // POST /instance/disconnect
      case 'disconnect': {
        const res = await fetch(`${apiUrl}/instance/disconnect`, {
          method: 'POST',
          headers: uazHeaders,
        })
        result = await res.json()
        
        await supabase.from('whatsapp_instances').update({
          status: 'disconnected',
          updated_at: new Date().toISOString(),
        }).eq('id', instanceId)
        
        break
      }

      // POST /profile/name
      case 'update_name': {
        if (!body.name) {
          return new Response(JSON.stringify({ error: 'name required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        const res = await fetch(`${apiUrl}/profile/name`, {
          method: 'POST',
          headers: uazHeaders,
          body: JSON.stringify({ name: body.name }),
        })
        result = await res.json()
        
        // Update local
        await supabase.from('whatsapp_instances').update({
          display_name: body.name,
          updated_at: new Date().toISOString(),
        }).eq('id', instanceId)
        
        break
      }

      // POST /profile/image
      case 'update_image': {
        if (!body.image) {
          return new Response(JSON.stringify({ error: 'image required (URL, base64, or "remove")' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        const res = await fetch(`${apiUrl}/profile/image`, {
          method: 'POST',
          headers: uazHeaders,
          body: JSON.stringify({ image: body.image }),
        })
        result = await res.json()
        break
      }

      // GET /instance/privacy
      case 'get_privacy': {
        const res = await fetch(`${apiUrl}/instance/privacy`, { headers: uazHeaders })
        result = await res.json()
        break
      }

      // POST /instance/privacy
      case 'set_privacy': {
        const res = await fetch(`${apiUrl}/instance/privacy`, {
          method: 'POST',
          headers: uazHeaders,
          body: JSON.stringify(body.settings || {}),
        })
        result = await res.json()
        break
      }

      // POST /instance/presence
      case 'set_presence': {
        const res = await fetch(`${apiUrl}/instance/presence`, {
          method: 'POST',
          headers: uazHeaders,
          body: JSON.stringify({ presence: body.presence || 'available' }),
        })
        result = await res.json()
        break
      }

      // DELETE /instance (delete from UAZAPI + local DB)
      case 'delete': {
        // Delete from UAZAPI first
        try {
          await fetch(`${apiUrl}/instance`, {
            method: 'DELETE',
            headers: uazHeaders,
          })
        } catch (e) {
          console.log('UAZAPI delete failed (may not exist):', e.message)
        }
        
        // Delete from local DB
        const { error: delErr } = await supabase
          .from('whatsapp_instances')
          .delete()
          .eq('id', instanceId)
        
        if (delErr) throw delErr
        
        result = { success: true, message: 'Instance deleted' }
        break
      }

      // POST /instance/updateInstanceName
      case 'update_instance_name': {
        if (!body.name) {
          return new Response(JSON.stringify({ error: 'name required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        
        // Update UAZAPI
        const res = await fetch(`${apiUrl}/instance/updateInstanceName`, {
          method: 'POST',
          headers: uazHeaders,
          body: JSON.stringify({ name: body.name }),
        })
        result = await res.json()
        
        // Update local
        await supabase.from('whatsapp_instances').update({
          instance_name: body.name,
          updated_at: new Date().toISOString(),
        }).eq('id', instanceId)
        
        break
      }

      // POST /webhook/set - configure webhook URL and events
      case 'set_webhook': {
        const webhookUrl = body.url || `${Deno.env.get('SUPABASE_URL')}/functions/v1/uazapi-webhook`
        const events = body.events || ['messages', 'messages_update', 'connection']
        
        const res = await fetch(`${apiUrl}/webhook`, {
          method: 'POST',
          headers: uazHeaders,
          body: JSON.stringify({
            url: webhookUrl,
            enabled: true,
            events,
          }),
        })
        result = await res.json()
        
        // Save webhook URL locally
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
