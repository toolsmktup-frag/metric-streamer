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
    console.log('Webhook received:', JSON.stringify(payload).slice(0, 500))

    // UAZAPI v2 sends event types: 'message', 'messages_update', 'connection'
    // Legacy: 'messages.upsert', 'messages.update', 'connection.update'
    const eventType = payload.event || payload.type || ''

    // Only process actual messages
    const isMessage = ['messages.upsert', 'message', 'message.new', 'messages'].includes(eventType)
      || payload.message
      || payload.messages
      || payload.data?.key // UAZAPI v2 sends message data in payload.data

    if (!isMessage) {
      // Handle status updates (v2: 'messages_update', legacy: 'messages.update')
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

    // Extract message data - UAZAPI v2 uses payload.data, legacy uses payload.message
    const msg = payload.data || payload.messages?.[0] || payload.message || payload
    const key = msg.key || {}
    const isFromMe = key.fromMe || false
    const remoteJid = key.remoteJid || msg.from || msg.phone || ''
    const phone = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '')
    const externalId = key.id || msg.messageId || msg.id

    // Outbound messages (fromMe): save them too for complete history
    // Deduplication by message_id_external will prevent duplicates

    if (!phone) {
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

    // Find the instance by checking which instance matches the webhook
    // UAZAPI usually sends instance info in the payload
    const instanceName = payload.instance || payload.instanceName || ''

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
        status: 200, // Don't retry
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const messageType = extractMessageType(msg)
    const body = extractBody(msg)
    const mediaUrl = extractMediaUrl(msg)
    const senderName = msg.pushName || msg.pushname || msg.senderName || null

    // Try to find lead by phone
    let leadId: string | null = null
    const variants = phoneVariations(phone)

    // Check unified_customers by phone
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

    // Insert inbound message
    const { error: insertErr } = await supabaseAdmin
      .from('whatsapp_messages')
      .insert({
        organization_id: orgId,
        instance_id: instanceId,
        phone,
        body,
        message_type: messageType,
        direction: 'inbound',
        status: 'delivered',
        media_url: mediaUrl,
        message_id_external: externalId,
        payload_raw: msg,
        sender_name: senderName,
        lead_id: leadId,
      })

    if (insertErr) {
      console.error('Error inserting inbound message:', insertErr)
      throw insertErr
    }

    return new Response(JSON.stringify({ ok: true, type: 'inbound', phone }), {
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
