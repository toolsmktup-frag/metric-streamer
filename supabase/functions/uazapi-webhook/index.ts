import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // Detect messages: v2 sends EventType:"messages" with chat object
    const isMessage = ['messages.upsert', 'message', 'message.new', 'messages'].includes(eventType)
      || payload.chat
      || payload.message
      || payload.messages
      || payload.data?.key

    if (!isMessage) {
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

    // UAZAPI v2: data is in payload.chat; legacy: payload.data / payload.message
    const chat = payload.chat || {}
    const msg = payload.data || payload.messages?.[0] || payload.message || chat || payload
    
    // v2 puts message info inside chat.lastMessage or similar structures
    const lastMessage = chat.lastMessage || chat.last_message || {}
    const messageData = msg.message || lastMessage.message || lastMessage || {}
    
    const key = msg.key || lastMessage.key || chat.key || {}
    const isFromMe = key.fromMe ?? lastMessage.fromMe ?? chat.fromMe ?? false
    
    // Extract phone from multiple possible locations (v2 and legacy)
    const remoteJid = key.remoteJid || chat.jid || chat.phone || chat.id || msg.from || msg.phone || ''
    const phone = remoteJid
      .replace('@s.whatsapp.net', '')
      .replace('@c.us', '')
      .replace(/\D/g, '')
    
    const externalId = key.id || lastMessage.id || msg.messageId || msg.id || chat.messageId || ''
    
    console.log('Extracted - phone:', phone, 'externalId:', externalId, 'fromMe:', isFromMe, 'remoteJid:', remoteJid)

    if (!phone) {
      console.log('No phone found in payload. chat keys:', Object.keys(chat), 'msg keys:', Object.keys(msg))
      return new Response(JSON.stringify({ ok: true, skipped: 'no_phone' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Deduplicate by external ID
    if (externalId) {
      const { data: existing } = await supabaseAdmin
        .from('whatsapp_messages')
        .select('id')
        .eq('message_id_external', externalId)
        .maybeSingle()

      if (existing) {
        return new Response(JSON.stringify({ ok: true, duplicate: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Find instance - v2 sends instance in payload.instance or payload.Instance
    const instanceName = payload.instance || payload.instanceName || payload.Instance || ''

    let instanceId: string | null = null
    let orgId: string | null = null

    if (instanceName) {
      const { data: inst } = await supabaseAdmin
        .from('whatsapp_instances')
        .select('id, organization_id')
        .eq('instance_name', instanceName)
        .maybeSingle()

      if (inst) {
        instanceId = inst.id
        orgId = inst.organization_id
      }
    }

    // Fallback: get the first active instance
    if (!instanceId) {
      const { data: inst } = await supabaseAdmin
        .from('whatsapp_instances')
        .select('id, organization_id')
        .eq('status', 'connected')
        .limit(1)
        .maybeSingle()

      if (inst) {
        instanceId = inst.id
        orgId = inst.organization_id
      }
    }

    if (!instanceId || !orgId) {
      console.error('No matching instance found for webhook')
      return new Response(JSON.stringify({ ok: false, error: 'no_instance' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Extract message content - try v2 chat structure first, then legacy
    const effectiveMsg = Object.keys(messageData).length > 0 ? { message: messageData } : msg
    const messageType = extractMessageType(effectiveMsg)
    const body = extractBody(effectiveMsg) 
      || chat.lastMessageBody || chat.last_message_body 
      || lastMessage.body || lastMessage.text
      || chat.body || ''
    const mediaUrl = extractMediaUrl(effectiveMsg)
    const senderName = msg.pushName || msg.pushname || chat.pushName || chat.name || chat.senderName || lastMessage.pushName || null

    console.log('Message - type:', messageType, 'body:', body?.slice(0, 100), 'sender:', senderName)

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

    const { error: insertErr } = await supabaseAdmin
      .from('whatsapp_messages')
      .insert({
        organization_id: orgId,
        instance_id: instanceId,
        phone,
        body,
        message_type: messageType,
        direction,
        status,
        media_url: mediaUrl,
        message_id_external: externalId,
        payload_raw: payload,
        sender_name: senderName,
        lead_id: leadId,
      })

    if (insertErr) {
      console.error('Error inserting message:', insertErr)
      throw insertErr
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
