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
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

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

    if (!instanceId || !action) {
      return new Response(JSON.stringify({ error: 'instance_id and action required' }), {
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
        result = await res.json()
        
        // Update status
        await supabase.from('whatsapp_instances').update({
          status: 'connecting',
          updated_at: new Date().toISOString(),
        }).eq('id', instanceId)
        
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
