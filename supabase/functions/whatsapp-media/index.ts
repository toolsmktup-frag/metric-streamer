// v1.1.0 - prefer Storage, backfill on-demand
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

function buildHeaders(apiToken: string) {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    token: apiToken,
  }
}

function getMessageIdCandidates(message: any) {
  const raw = message?.payload_raw || {}
  const payloadMessage = raw.message || {}

  return Array.from(new Set([
    payloadMessage.messageid,
    payloadMessage.id,
    message?.message_id_external,
  ].filter(Boolean)))
}

async function parseJsonResponse(res: Response) {
  const text = await res.text()
  try {
    return {
      text,
      data: text ? JSON.parse(text) : null,
    }
  } catch {
    return {
      text,
      data: null,
    }
  }
}

class MediaNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MediaNotFoundError'
  }
}

const MEDIA_BUCKET = 'whatsapp-media'

function extFromMime(mime: string, fallback: string): string {
  if (!mime) return fallback
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg'
  if (mime.includes('png')) return 'png'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('gif')) return 'gif'
  if (mime.includes('mp4')) return 'mp4'
  if (mime.includes('quicktime')) return 'mov'
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3'
  if (mime.includes('wav')) return 'wav'
  if (mime.includes('pdf')) return 'pdf'
  return fallback
}

/** Save downloaded media to Storage and return public URL. Best effort. */
async function backfillToStorage(
  adminClient: any,
  params: { messageRowId: string; orgId: string; instanceId: string; base64: string; mime: string; messageType: string }
): Promise<string | null> {
  try {
    const { messageRowId, orgId, instanceId, base64, mime, messageType } = params
    const fallbackExt = messageType === 'image' ? 'jpg' : messageType === 'video' ? 'mp4' : (messageType === 'audio' || messageType === 'ptt') ? 'ogg' : 'bin'
    const ext = extFromMime(mime, fallbackExt)
    const path = `${orgId}/${instanceId}/${messageRowId}.${ext}`
    const binary = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
    const { error: upErr } = await adminClient.storage
      .from(MEDIA_BUCKET)
      .upload(path, binary, { contentType: mime || 'application/octet-stream', upsert: true })
    if (upErr) {
      console.warn('[backfill] upload failed', upErr.message)
      return null
    }
    const { data: pub } = adminClient.storage.from(MEDIA_BUCKET).getPublicUrl(path)
    const publicUrl = pub?.publicUrl || null
    if (publicUrl) {
      await adminClient
        .from('whatsapp_messages')
        .update({ media_url: publicUrl, media_mime_type: mime || null, updated_at: new Date().toISOString() })
        .eq('id', messageRowId)
    }
    return publicUrl
  } catch (err) {
    console.warn('[backfill] error', (err as Error).message)
    return null
  }
}

async function downloadMessageMedia(apiUrl: string, apiToken: string, messageId: string) {
  const baseUrl = apiUrl.replace(/\/+$/, '')
  const res = await fetch(`${baseUrl}/message/download`, {
    method: 'POST',
    headers: buildHeaders(apiToken),
    body: JSON.stringify({
      id: messageId,
      return_base64: true,
      return_link: false,
      generate_mp3: true,
      transcribe: false,
    }),
  })

  const { text, data } = await parseJsonResponse(res)
  if (!res.ok) {
    if (res.status === 404) {
      throw new MediaNotFoundError(`UAZAPI 404 for ${messageId}: ${text.slice(0, 200)}`)
    }
    throw new Error(`UAZAPI returned ${res.status}: ${text.slice(0, 300)}`)
  }

  const mimetype = data?.mimetype || 'audio/mpeg'
  if (data?.base64Data) {
    return {
      mimetype,
      base64: data.base64Data as string,
      dataUrl: `data:${mimetype};base64,${data.base64Data}`,
    }
  }

  if (data?.fileURL) {
    return {
      mimetype,
      fileURL: data.fileURL as string,
    }
  }

  throw new Error('UAZAPI did not return playable media')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
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
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { message_id } = await req.json()
    if (!message_id) {
      return new Response(JSON.stringify({ error: 'message_id required' }), {
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

    const { data: message, error: messageErr } = await adminClient
      .from('whatsapp_messages')
      .select('id, organization_id, instance_id, message_id_external, payload_raw, message_type, phone, media_url, media_mime_type')
      .eq('id', message_id)
      .eq('organization_id', orgId)
      .single()

    if (messageErr || !message) {
      return new Response(JSON.stringify({ error: 'Message not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // --- Authorization: sellers can only fetch media for instances + leads they own ---
    const { data: profile } = await adminClient
      .from('user_profiles')
      .select('role')
      .eq('id', userData.user.id)
      .maybeSingle()
    const role = profile?.role || 'vendedor'
    const isAdmin = role === 'admin' || role === 'gestor'

    if (!isAdmin) {
      const { data: instAccess } = await adminClient
        .from('whatsapp_instance_access')
        .select('instance_id')
        .eq('user_id', userData.user.id)
        .eq('instance_id', message.instance_id)
        .maybeSingle()
      if (!instAccess) {
        return new Response(JSON.stringify({ error: 'Forbidden: instance not allowed' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const cleanPhone = (message.phone || '').replace(/\D/g, '')
      const phoneAlt = cleanPhone.startsWith('55') ? cleanPhone.slice(2) : `55${cleanPhone}`
      const { data: ownedLead } = await adminClient
        .from('leads')
        .select('id')
        .eq('organization_id', orgId)
        .eq('assigned_to', userData.user.id)
        .in('phone', [cleanPhone, `+${cleanPhone}`, phoneAlt, `+${phoneAlt}`])
        .limit(1)
        .maybeSingle()
      if (!ownedLead) {
        return new Response(JSON.stringify({ error: 'Forbidden: lead not assigned to you' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    const { data: instance, error: instanceErr } = await adminClient
      .from('whatsapp_instances')
      .select('api_url, api_token')
      .eq('id', message.instance_id)
      .eq('organization_id', orgId)
      .single()

    if (instanceErr || !instance) {
      return new Response(JSON.stringify({ error: 'Instance not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Short-circuit: if media_url already points to our internal Storage bucket,
    // return it directly without calling UAZAPI.
    if (message.media_url && typeof message.media_url === 'string' && message.media_url.includes(`/storage/v1/object/public/${MEDIA_BUCKET}/`)) {
      return new Response(JSON.stringify({
        mimetype: message.media_mime_type || 'application/octet-stream',
        fileURL: message.media_url,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const candidates = getMessageIdCandidates(message)
    if (candidates.length === 0) {
      return new Response(JSON.stringify({ error: 'No message download id available' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let lastError = 'Unknown error'
    let allNotFound = candidates.length > 0
    for (const candidate of candidates) {
      try {
        const media = await downloadMessageMedia(instance.api_url, instance.api_token, candidate)

        // On-demand backfill: if we got base64, persist it to Storage so future calls are fast.
        if (media.base64) {
          const publicUrl = await backfillToStorage(adminClient, {
            messageRowId: message.id,
            orgId: message.organization_id,
            instanceId: message.instance_id,
            base64: media.base64,
            mime: media.mimetype,
            messageType: message.message_type || 'document',
          })
          if (publicUrl) {
            return new Response(JSON.stringify({
              mimetype: media.mimetype,
              fileURL: publicUrl,
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
          }
        }

        // Fallback to dataUrl/fileURL response
        const { base64: _b, ...mediaResponse } = media as any
        return new Response(JSON.stringify(mediaResponse), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        if (!(error instanceof MediaNotFoundError)) allNotFound = false
        console.error('[whatsapp-media] download failed for candidate', candidate, lastError)
      }
    }

    if (allNotFound) {
      return new Response(JSON.stringify({
        error: 'MESSAGE_NOT_FOUND',
        fallback: true,
        message: 'Mídia não está mais disponível no servidor do WhatsApp',
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: lastError }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[whatsapp-media] error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})