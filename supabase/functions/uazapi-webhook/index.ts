// v1.1.0 - persist media to Supabase Storage
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MEDIA_BUCKET = 'whatsapp-media'
const MEDIA_TYPES = new Set(['image', 'audio', 'ptt', 'video', 'document', 'sticker'])

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

function defaultExt(messageType: string): string {
  switch (messageType) {
    case 'image': return 'jpg'
    case 'video': return 'mp4'
    case 'audio':
    case 'ptt': return 'ogg'
    case 'sticker': return 'webp'
    default: return 'bin'
  }
}

/**
 * Fire-and-forget: download media via UAZAPI and persist to Storage.
 * Updates whatsapp_messages.media_url to the public Storage URL on success.
 */
async function persistMediaAsync(
  adminClient: any,
  params: {
    messageRowId: string
    orgId: string
    instanceId: string
    apiUrl: string
    apiToken: string
    externalMessageId: string
    messageType: string
  }
) {
  try {
    const { messageRowId, orgId, instanceId, apiUrl, apiToken, externalMessageId, messageType } = params
    if (!apiUrl || !apiToken || !externalMessageId) return

    const baseUrl = apiUrl.replace(/\/+$/, '')
    const res = await fetch(`${baseUrl}/message/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', token: apiToken },
      body: JSON.stringify({
        id: externalMessageId,
        return_base64: true,
        return_link: false,
        generate_mp3: messageType === 'audio' || messageType === 'ptt',
        transcribe: false,
      }),
    })

    if (!res.ok) {
      console.warn('[persistMedia] UAZAPI download failed', res.status, externalMessageId)
      return
    }
    const data = await res.json().catch(() => null)
    const base64 = data?.base64Data
    const mime = data?.mimetype || ''
    if (!base64) return

    const binary = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
    const ext = extFromMime(mime, defaultExt(messageType))
    const path = `${orgId}/${instanceId}/${messageRowId}.${ext}`

    const { error: upErr } = await adminClient.storage
      .from(MEDIA_BUCKET)
      .upload(path, binary, { contentType: mime || 'application/octet-stream', upsert: true })

    if (upErr) {
      console.error('[persistMedia] upload failed', upErr.message)
      return
    }

    const { data: pub } = adminClient.storage.from(MEDIA_BUCKET).getPublicUrl(path)
    const publicUrl = pub?.publicUrl
    if (!publicUrl) return

    await adminClient
      .from('whatsapp_messages')
      .update({ media_url: publicUrl, media_mime_type: mime || null, updated_at: new Date().toISOString() })
      .eq('id', messageRowId)

    console.log('[persistMedia] saved', path)
  } catch (err) {
    console.error('[persistMedia] error', (err as Error).message)
  }
}

/**
 * Normaliza telefone BR removendo ou adicionando o 9º dígito
 * para tentar match com variações
 */
function phoneVariations(phone: string): string[] {
  // Remove tudo que não é número
  const clean = phone.replace(/\D/g, '')
  const variants = [clean]

  // Se começa com 55 e tem 13 dígitos (com 9º dígito), gerar versão sem
  if (clean.startsWith('55') && clean.length === 13) {
    const ddd = clean.slice(2, 4)
    const rest = clean.slice(5) // pula o 9
    variants.push(`55${ddd}${rest}`)
  }

  // Se começa com 55 e tem 12 dígitos (sem 9º dígito), gerar versão com
  if (clean.startsWith('55') && clean.length === 12) {
    const ddd = clean.slice(2, 4)
    const rest = clean.slice(4)
    variants.push(`55${ddd}9${rest}`)
  }

  return [...new Set(variants)]
}

function extractMessageType(payload: any): string {
  // UAZAPI v2: message.type or message.mediaType
  const v2Type = payload.type || payload.mediaType || payload.messageType || ''
  if (v2Type) {
    const t = v2Type.toLowerCase()
    if (t.includes('image')) return 'image'
    if (t.includes('audio') || t.includes('ptt')) return 'audio'
    if (t.includes('video')) return 'video'
    if (t.includes('document')) return 'document'
    if (t.includes('sticker')) return 'sticker'
    if (t.includes('location')) return 'location'
    if (t.includes('contact') || t.includes('vcard')) return 'contact'
  }
  // Fallback: detect from content object (v2 audio/media with generic type)
  if (typeof payload.content === 'object' && payload.content) {
    if (payload.content.PTT || payload.content.ptt) return 'audio'
    const mime = (payload.content.mimetype || '').toLowerCase()
    if (mime.includes('audio')) return 'audio'
    if (mime.includes('image')) return 'image'
    if (mime.includes('video')) return 'video'
    if (mime.includes('pdf') || mime.includes('document')) return 'document'
  }
  // Legacy baileys format
  if (payload.message?.imageMessage) return 'image'
  if (payload.message?.audioMessage) return 'audio'
  if (payload.message?.videoMessage) return 'video'
  if (payload.message?.documentMessage) return 'document'
  if (payload.message?.stickerMessage) return 'sticker'
  if (payload.message?.locationMessage) return 'location'
  if (payload.message?.contactMessage) return 'contact'
  if (payload.message?.pttMessage || payload.message?.audioMessage?.ptt) return 'ptt'
  return 'text'
}

function extractBody(payload: any): string {
  return (
    // UAZAPI v2: text/content fields directly on message
    payload.text ||
    payload.content ||
    // Legacy baileys format
    payload.message?.conversation ||
    payload.message?.extendedTextMessage?.text ||
    payload.message?.imageMessage?.caption ||
    payload.message?.videoMessage?.caption ||
    payload.message?.documentMessage?.caption ||
    ''
  )
}

function extractMediaUrl(payload: any): string | null {
  // UAZAPI typically provides base64 or URL depending on config
  return (
    payload.message?.imageMessage?.url ||
    payload.message?.audioMessage?.url ||
    payload.message?.videoMessage?.url ||
    payload.message?.documentMessage?.url ||
    null
  )
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
    const payload = await req.json()
    console.log('Webhook received:', JSON.stringify(payload).slice(0, 3000))

    // UAZAPI v2 uses PascalCase (EventType), legacy uses lowercase (event)
    const eventType = payload.EventType || payload.event || payload.type || ''
    console.log('EventType detected:', eventType)

    // Detect group event by multiple signals (UAZAPI v2 sends PascalCase / mixed shapes)
    const eventTypeLower = String(eventType).toLowerCase()
    const groupJidCandidates = [
      payload.groupjid, payload.GroupJID, payload.groupJid,
      payload.chatid, payload.chatId,
      payload.chat?.wa_chatid, payload.chat?.jid,
      payload.group?.jid, payload.group?.JID,
      payload.data?.groupjid, payload.data?.GroupJID,
    ].filter(Boolean).map((v: any) => String(v))
    const hasGroupJid = groupJidCandidates.some(jid => jid.endsWith('@g.us'))
    const hasParticipants = !!(payload.Participants || payload.participants || payload.data?.Participants || payload.data?.participants)
    const isGroupEventType = ['groups', 'group_participants', 'group.participants.update', 'presence', 'chats'].includes(eventTypeLower)
      || eventTypeLower.includes('group')
    const isGroupEvent = (isGroupEventType && (hasGroupJid || hasParticipants)) || (hasGroupJid && hasParticipants)

    // Detect messages: v2 sends EventType:"messages" with chat object
    const isMessage = !isGroupEvent && (
      ['messages.upsert', 'message', 'message.new', 'messages'].includes(eventType)
      || payload.chat
      || payload.message
      || payload.messages
      || payload.data?.key
    )

    if (!isMessage) {
      if (isGroupEvent) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseAdminAudit = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
        // Fire-and-forget audit log (table may not exist; ignore errors)
        try {
          await supabaseAdminAudit.from('webhook_audit').insert({
            source: 'uazapi',
            event_type: `group:${eventTypeLower || 'unknown'}`,
            payload,
          })
        } catch (_e) { /* table optional */ }

        const groupSyncRes = await fetch(`${supabaseUrl}/functions/v1/wz-group-sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
          },
          body: JSON.stringify({ mode: 'webhook_event', payload }),
        })
        const groupSyncData = await groupSyncRes.json().catch(() => null)
        console.log('Group event forwarded:', eventTypeLower, 'jids:', groupJidCandidates, 'result:', groupSyncData)
        return new Response(JSON.stringify({ ok: true, type: 'groups', eventType: eventTypeLower, groupSync: groupSyncData }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Handle status updates
      if (['messages.update', 'message.update', 'messages_update', 'status'].includes(eventType)) {
        const supabaseAdmin = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        )

        const updates = payload.messages || payload.data || [payload]
        const updatesArr = Array.isArray(updates) ? updates : [updates]
        for (const upd of updatesArr) {
          const externalId = upd.key?.id || upd.messageId
          if (!externalId) continue

          let newStatus = 'sent'
          if (upd.update?.status === 3 || upd.status === 'DELIVERY_ACK' || upd.status === 3) newStatus = 'delivered'
          if (upd.update?.status === 4 || upd.status === 'READ' || upd.status === 4) newStatus = 'read'
          if (upd.update?.status === 5 || upd.status === 'PLAYED' || upd.status === 5) newStatus = 'read'

          await supabaseAdmin
            .from('whatsapp_messages')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('message_id_external', externalId)
        }

        return new Response(JSON.stringify({ ok: true, type: 'status_update' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ ok: true, ignored: eventType }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Lookup instance: try BaseUrl -> api_url match first, then instanceName fallback
    const baseUrl = (payload.BaseUrl || payload.baseUrl || '').replace(/\/+$/, '')
    const instanceName = payload.instanceName || payload.instance || ''
    console.log('Looking up instance - BaseUrl:', baseUrl, 'instanceName:', instanceName)

    let instanceData: any = null
    let instanceError: any = null

    // Strategy 1: Match by api_url (most reliable)
    if (baseUrl) {
      const { data, error } = await supabaseAdmin
        .from('whatsapp_instances')
        .select('id, organization_id, api_url, api_token')
        .eq('api_url', baseUrl)
        .maybeSingle()
      if (data) {
        instanceData = data
        console.log('Instance found by api_url match:', baseUrl)
      } else {
        console.log('No instance found by api_url:', baseUrl, error)
        const { data: d2 } = await supabaseAdmin
          .from('whatsapp_instances')
          .select('id, organization_id, api_url, api_token')
          .ilike('api_url', `${baseUrl}%`)
          .maybeSingle()
        if (d2) {
          instanceData = d2
          console.log('Instance found by api_url ilike match')
        }
      }
    }

    // Strategy 2: Match by instance_name
    if (!instanceData && instanceName) {
      const { data, error } = await supabaseAdmin
        .from('whatsapp_instances')
        .select('id, organization_id, api_url, api_token')
        .eq('instance_name', instanceName)
        .maybeSingle()
      if (data) {
        instanceData = data
        console.log('Instance found by instance_name:', instanceName)
      } else {
        instanceError = error
      }
    }

    // Strategy 3: Match by token if present in payload
    const payloadToken = payload.token || ''
    if (!instanceData && payloadToken) {
      const { data } = await supabaseAdmin
        .from('whatsapp_instances')
        .select('id, organization_id, api_url, api_token')
        .eq('api_token', payloadToken)
        .maybeSingle()
      if (data) {
        instanceData = data
        console.log('Instance found by api_token match')
      }
    }

    if (!instanceData) {
      console.error('Instance not found by any method. BaseUrl:', baseUrl, 'instanceName:', instanceName, 'token prefix:', payloadToken?.slice(0, 8))
      return new Response(JSON.stringify({ error: 'Instance not found', baseUrl, instanceName }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const instanceId = instanceData.id
    const orgId = instanceData.organization_id
    console.log('Instance found - id:', instanceId, 'orgId:', orgId)

    // UAZAPI v2 payload structure:
    // { EventType: "messages", instanceName: "xxx", chat: {...}, message: { text, content, fromMe, chatid, senderName, id, ... } }
    // Legacy baileys: { event: "messages.upsert", data: { key: { remoteJid, fromMe, id }, message: { conversation }, pushName } }
    const chat = payload.chat || {}
    const v2Message = payload.message || {}  // v2: flat message object with text/content/fromMe
    const legacyMsg = payload.data || payload.messages?.[0] || {}  // legacy baileys
    
    // Detect if this is v2 format (message has .text or .content or .chatid)
    const isV2 = !!(v2Message.chatid || v2Message.text !== undefined || v2Message.content !== undefined || v2Message.messageid)
    
    let isFromMe: boolean
    let phone: string
    let externalId: string
    let senderName: string | null
    let messageBody: string
    let messageType: string
    let mediaUrl: string | null
    
    if (isV2) {
      // UAZAPI v2 format
      isFromMe = v2Message.fromMe === true
      
      // Phone from message.chatid or chat.wa_chatid or chat.phone
      const rawJid = v2Message.chatid || chat.wa_chatid || v2Message.sender_pn || chat.phone || ''
      phone = rawJid
        .replace('@s.whatsapp.net', '')
        .replace('@c.us', '')
        .replace(/\D/g, '')
      
      // External ID: UAZAPI v2 uses "owner:messageId" format or just messageid
      externalId = v2Message.id || `${payload.owner || ''}:${v2Message.messageid || ''}` || ''
      
      senderName = v2Message.senderName || chat.name || chat.wa_name || null
      messageBody = v2Message.text || v2Message.caption || (typeof v2Message.content === 'string' ? v2Message.content : '') || ''
      messageType = extractMessageType(v2Message)
      mediaUrl = v2Message.mediaUrl || v2Message.media_url || v2Message.fileUrl || v2Message.file_url || null
      
      // Fallback: try to extract media URL from content object (audio/image/video/document)
      if (!mediaUrl && typeof v2Message.content === 'object' && v2Message.content) {
        mediaUrl = v2Message.content.url || v2Message.content.URL || v2Message.content.mediaUrl || v2Message.content.fileUrl || null
      }
      
      console.log('V2 extracted - phone:', phone, 'body:', messageBody?.slice(0, 50), 'fromMe:', isFromMe, 'sender:', senderName)
    } else {
      // Legacy baileys format
      const msg = legacyMsg.key ? legacyMsg : (v2Message.key ? v2Message : legacyMsg)
      const key = msg.key || {}
      isFromMe = key.fromMe || false
      
      const remoteJid = key.remoteJid || msg.from || msg.phone || ''
      phone = remoteJid
        .replace('@s.whatsapp.net', '')
        .replace('@c.us', '')
        .replace(/\D/g, '')
      
      externalId = key.id || msg.messageId || msg.id || ''
      senderName = msg.pushName || msg.pushname || null
      messageBody = extractBody(msg)
      messageType = extractMessageType(msg)
      mediaUrl = extractMediaUrl(msg)
      
      console.log('Legacy extracted - phone:', phone, 'body:', messageBody?.slice(0, 50), 'fromMe:', isFromMe)
    }

    console.log('Extracted - phone:', phone, 'externalId:', externalId, 'fromMe:', isFromMe)

    // Try to find lead by phone
    let leadId: string | null = null
    const variants = phoneVariations(phone)

    for (const variant of variants) {
      const { data: customer } = await supabaseAdmin
        .from('unified_customers')
        .select('id')
        .eq('organization_id', orgId)
        .eq('primary_phone', variant)
        .maybeSingle()

      if (customer) {
        leadId = customer.id
        break
      }
    }

    const direction = isFromMe ? 'outbound' : 'inbound'
    const status = isFromMe ? 'sent' : 'delivered'

    const { data: insertedRow, error: insertErr } = await supabaseAdmin
      .from('whatsapp_messages')
      .insert({
        organization_id: orgId,
        instance_id: instanceId,
        phone,
        body: messageBody,
        message_type: messageType,
        direction,
        status,
        media_url: mediaUrl,
        message_id_external: externalId,
        payload_raw: payload,
        sender_name: senderName,
        lead_id: leadId,
      })
      .select('id')
      .single()

    if (insertErr) {
      console.error('Error inserting message:', insertErr)
      throw insertErr
    }

    // Fire-and-forget: persist media to Storage if this is a media message (inbound only;
    // outbound media we already uploaded ourselves via ChatInput).
    if (
      insertedRow?.id &&
      direction === 'inbound' &&
      MEDIA_TYPES.has(messageType) &&
      externalId &&
      instanceData.api_url &&
      instanceData.api_token
    ) {
      // Don't await; let the webhook return fast
      persistMediaAsync(supabaseAdmin, {
        messageRowId: insertedRow.id,
        orgId,
        instanceId,
        apiUrl: instanceData.api_url,
        apiToken: instanceData.api_token,
        externalMessageId: externalId,
        messageType,
      })
    }

    // Upsert contact info when we have a sender name (inbound or from chat metadata)
    const contactName = senderName || (chat?.name || chat?.wa_name || null)
    const contactPic = chat?.imagePreview || chat?.profilePicUrl || null
    if (contactName && phone) {
      const { error: contactErr } = await supabaseAdmin
        .from('whatsapp_contacts')
        .upsert({
          organization_id: orgId,
          instance_id: instanceId,
          phone,
          name: contactName,
          profile_pic_url: contactPic,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'organization_id,instance_id,phone' })
      if (contactErr) {
        console.error('Error upserting contact:', contactErr)
      }
    }

    console.log('Message saved successfully:', direction, phone)
    return new Response(JSON.stringify({ ok: true, type: direction, phone }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('uazapi-webhook error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
