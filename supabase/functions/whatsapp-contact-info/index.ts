// v1.0.1 - force redeploy with verify_jwt=false
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

    const url = new URL(req.url)
    const phone = url.searchParams.get('phone')
    const instanceId = url.searchParams.get('instance_id')

    if (!phone || !instanceId) {
      return new Response(JSON.stringify({ error: 'phone and instance_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get instance
    const { data: instance, error: instErr } = await supabase
      .from('whatsapp_instances')
      .select('api_url, api_token')
      .eq('id', instanceId)
      .single()

    if (instErr || !instance) {
      return new Response(JSON.stringify({ error: 'Instance not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const chatId = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`

    // Try multiple endpoint patterns
    const attempts = [
      {
        url: `${instance.api_url}/chat/details`,
        body: { phone: chatId },
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${instance.api_token}` },
      },
      {
        url: `${instance.api_url}/contact/info`,
        body: { phone: chatId },
        headers: { 'Content-Type': 'application/json', 'token': instance.api_token },
      },
    ]

    for (const attempt of attempts) {
      try {
        const res = await fetch(attempt.url, {
          method: 'POST',
          headers: attempt.headers,
          body: JSON.stringify(attempt.body),
        })

        if (res.ok) {
          const data = await res.json()
          return new Response(JSON.stringify({
            name: data.name || data.pushname || data.notify || null,
            picture: data.picture || data.profilePictureUrl || data.imgUrl || null,
            phone,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        await res.text() // consume body
      } catch (e) {
        console.log(`Contact info attempt failed:`, e.message)
      }
    }

    // Return empty if all attempts fail
    return new Response(JSON.stringify({ name: null, picture: null, phone }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('whatsapp-contact-info error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
