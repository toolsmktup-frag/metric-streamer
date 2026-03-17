// v1.0.1 - force redeploy with verify_jwt=false
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

interface SendRequest {
  instance_id: string
  phone: string
  body?: string
  message_type?: string
  media_url?: string
  media_filename?: string
  action?: 'send' | 'edit' | 'delete'
  message_id?: string // for edit/delete
}

async function tryUazapiSend(apiUrl: string, apiToken: string, instanceName: string, phone: string, body: string, messageType: string, mediaUrl?: string) {
  const chatId = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`

  // UAZAPI v2 uses query string auth: ?token=xxx
  const authQuery = `?token=${apiToken}`
  
  // Normalize base URL (remove trailing slash)
  const baseUrl = apiUrl.replace(/\/+$/, '')

  // Try multiple endpoint patterns for UAZAPI compatibility
  // Pattern 1: UAZAPI v2 with instance in path: /instance/{name}/send/text?token=xxx
  // Pattern 2: Direct path (if api_url already includes instance): /send/text?token=xxx
  const attempts = []

  if (messageType !== 'text' && mediaUrl) {
    attempts.push(
      {
        url: `${baseUrl}/instance/${instanceName}/send/media${authQuery}`,
        body: { phone: chatId, url: mediaUrl, caption: body || '', type: messageType },
        headers: { 'Content-Type': 'application/json' },
      },
      {
        url: `${baseUrl}/send/media${authQuery}`,
        body: { phone: chatId, url: mediaUrl, caption: body || '', type: messageType },
        headers: { 'Content-Type': 'application/json' },
      },
    )
  } else {
    attempts.push(
      // UAZAPI v2: instance in path
      {
        url: `${baseUrl}/instance/${instanceName}/send/text${authQuery}`,
        body: { phone: chatId, message: body },
        headers: { 'Content-Type': 'application/json' },
      },
      // Direct path (api_url may already include instance)
      {
        url: `${baseUrl}/send/text${authQuery}`,
        body: { phone: chatId, message: body },
        headers: { 'Content-Type': 'application/json' },
      },
      // Legacy pattern
      {
        url: `${baseUrl}/message/text${authQuery}`,
        body: { phone: chatId, message: body },
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  for (const attempt of attempts) {
    try {
      console.log(`Trying UAZAPI: ${attempt.url}`)
      const res = await fetch(attempt.url, {
        method: 'POST',
        headers: attempt.headers,
        body: JSON.stringify(attempt.body),
      })

      const responseText = await res.text()
      console.log(`UAZAPI response ${attempt.url}: ${res.status} - ${responseText.slice(0, 500)}`)

      if (res.ok) {
        try {
          const data = JSON.parse(responseText)
          return { success: true, data }
        } catch {
          return { success: true, data: { raw: responseText } }
        }
      }
    } catch (e) {
      console.log(`Attempt ${attempt.url} error:`, e.message)
    }
  }

  throw new Error('All UAZAPI send attempts failed')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: userData, error: userErr } = await supabase.auth.getUser()
    if (userErr || !userData?.user) {
      console.error('Auth error:', userErr)
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const payload: SendRequest = await req.json()
    const { instance_id, phone, body, message_type = 'text', media_url, media_filename, action = 'send', message_id } = payload

    if (!instance_id || !phone) {
      return new Response(JSON.stringify({ error: 'instance_id and phone required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get instance
    const { data: instance, error: instErr } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('id', instance_id)
      .single()

    if (instErr || !instance) {
      return new Response(JSON.stringify({ error: 'Instance not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Handle soft delete
    if (action === 'delete' && message_id) {
      const { error: delErr } = await supabase
        .from('whatsapp_messages')
        .update({ is_deleted: true, body: '🚫 Mensagem apagada', updated_at: new Date().toISOString() })
        .eq('id', message_id)

      if (delErr) throw delErr

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Handle edit
    if (action === 'edit' && message_id && body) {
      const { error: editErr } = await supabase
        .from('whatsapp_messages')
        .update({ body, updated_at: new Date().toISOString() })
        .eq('id', message_id)

      if (editErr) throw editErr

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Send via UAZAPI
    console.log('Sending via UAZAPI - api_url:', instance.api_url, 'instance_name:', instance.instance_name, 'phone:', phone)
    const result = await tryUazapiSend(
      instance.api_url,
      instance.api_token,
      instance.instance_name,
      phone,
      body || '',
      message_type,
      media_url
    )

    // Save outbound message
    const { data: orgId } = await supabase.rpc('get_user_org_id')

    const messageRecord: any = {
      organization_id: orgId,
      instance_id,
      phone,
      body: body || '',
      message_type,
      direction: 'outbound',
      status: 'sent',
      media_url,
      media_filename,
      message_id_external: result.data?.key?.id || result.data?.messageId || null,
      payload_raw: result.data,
    }

    const { data: savedMsg, error: saveErr } = await supabase
      .from('whatsapp_messages')
      .insert(messageRecord)
      .select()
      .single()

    if (saveErr) {
      console.error('Error saving outbound message:', saveErr)
    }

    return new Response(JSON.stringify({ success: true, message: savedMsg, uazapi_response: result.data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('whatsapp-send error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
