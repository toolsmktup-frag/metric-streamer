// v1.0.2 - simplify UAZAPI send flow and use admin client for writes
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
  message_id?: string
}

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, '')
}

function buildHeaders(apiToken: string) {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    token: apiToken,
  }
}

function mapMediaType(messageType: string) {
  if (messageType === 'audio') return 'ptt'
  return messageType
}

function isSuccessfulResponse(res: Response, _data: any) {
  // Accept any 2xx HTTP status as success — UAZAPI may include warning fields in body
  return res.ok
}

async function parseResponse(res: Response) {
  const responseText = await res.text()
  try {
    return {
      text: responseText,
      data: responseText ? JSON.parse(responseText) : null,
    }
  } catch {
    return {
      text: responseText,
      data: responseText ? { raw: responseText } : null,
    }
  }
}

async function tryUazapiSend(apiUrl: string, apiToken: string, phone: string, body: string, messageType: string, mediaUrl?: string, mediaFilename?: string) {
  const baseUrl = apiUrl.replace(/\/+$/, '')
  const recipient = normalizePhone(phone) // Use clean phone only — UAZAPI spec uses plain numbers

  const payload = messageType !== 'text' && mediaUrl
    ? {
        number: recipient,
        type: mapMediaType(messageType),
        file: mediaUrl,
        ...(body ? { text: body } : {}),
        ...(messageType === 'document' && mediaFilename ? { docName: mediaFilename } : {}),
        readchat: true,
        readmessages: true,
        async: false,
      }
    : {
        number: recipient,
        text: body,
        readchat: true,
        readmessages: true,
        async: false,
      }

  const url = `${baseUrl}${messageType !== 'text' && mediaUrl ? '/send/media' : '/send/text'}`

  console.log(`[whatsapp-send] URL: ${url}`)
  console.log(`[whatsapp-send] Token prefix: ${apiToken?.slice(0, 8)}...`)
  console.log(`[whatsapp-send] Payload: ${JSON.stringify(payload)}`)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(apiToken),
      body: JSON.stringify(payload),
    })

    const { text, data } = await parseResponse(res)
    console.log(`[whatsapp-send] Response status: ${res.status}`)
    console.log(`[whatsapp-send] Response body: ${text.slice(0, 1000)}`)

    if (isSuccessfulResponse(res, data)) {
      return { success: true, data }
    }

    throw new Error(`UAZAPI returned ${res.status}: ${text.slice(0, 500)}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[whatsapp-send] Failed: ${message}`)
    throw new Error(`UAZAPI send failed: ${message}`)
  }
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

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: userData, error: userErr } = await userClient.auth.getUser()
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

    const { data: orgId, error: orgErr } = await userClient.rpc('get_user_org_id')
    if (orgErr || !orgId) {
      return new Response(JSON.stringify({ error: 'Org not found' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: instance, error: instErr } = await userClient
      .from('whatsapp_instances')
      .select('*')
      .eq('id', instance_id)
      .eq('organization_id', orgId)
      .single()

    if (instErr || !instance) {
      return new Response(JSON.stringify({ error: 'Instance not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'delete' && message_id) {
      const { error: delErr } = await adminClient
        .from('whatsapp_messages')
        .update({ is_deleted: true, body: '🚫 Mensagem apagada', updated_at: new Date().toISOString() })
        .eq('id', message_id)
        .eq('organization_id', orgId)

      if (delErr) throw delErr

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'edit' && message_id && body) {
      const { error: editErr } = await adminClient
        .from('whatsapp_messages')
        .update({ body, updated_at: new Date().toISOString() })
        .eq('id', message_id)
        .eq('organization_id', orgId)

      if (editErr) throw editErr

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('[whatsapp-send] sending via UAZAPI', {
      api_url: instance.api_url,
      phone: normalizePhone(phone),
      message_type,
    })

    const result = await tryUazapiSend(
      instance.api_url,
      instance.api_token,
      phone,
      body || '',
      message_type,
      media_url,
      media_filename
    )

    const messageRecord: Record<string, unknown> = {
      organization_id: orgId,
      instance_id,
      phone: normalizePhone(phone),
      body: body || '',
      message_type,
      direction: 'outbound',
      status: 'sent',
      media_url,
      media_filename,
      message_id_external: result.data?.keyId || result.data?.key?.id || result.data?.messageId || result.data?.id || null,
      payload_raw: result.data,
    }

    const { data: savedMsg, error: saveErr } = await adminClient
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
    const message = err instanceof Error ? err.message : String(err)
    console.error('whatsapp-send error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})