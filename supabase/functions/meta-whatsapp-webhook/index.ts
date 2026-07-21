// meta-whatsapp-webhook — recebe eventos da WhatsApp Cloud API (Meta).
// GET  -> verificação do webhook (hub.challenge)
// POST -> status de entrega (sent/delivered/read/failed) e mensagens inbound.
// Identifica a instância pelo metadata.phone_number_id e grava em whatsapp_messages.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function admin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

async function verifySignature(appSecret: string, rawBody: string, signatureHeader: string | null): Promise<boolean> {
  if (!signatureHeader?.startsWith('sha256=')) return false
  const expected = signatureHeader.slice('sha256='.length)
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return hex === expected
}

function extractBody(message: any): string {
  switch (message?.type) {
    case 'text': return message.text?.body || ''
    case 'button': return message.button?.text || ''
    case 'interactive':
      return message.interactive?.button_reply?.title
        || message.interactive?.list_reply?.title
        || '[interactive]'
    case 'image': case 'video': case 'audio': case 'document': case 'sticker':
      return `[${message.type}]`
    default: return message?.type ? `[${message.type}]` : ''
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // --- GET: verificação do webhook (Meta App > WhatsApp > Configuration) ---
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    const envToken = Deno.env.get('META_WEBHOOK_VERIFY_TOKEN')
    let ok = mode === 'subscribe' && !!token && token === envToken
    if (!ok && token) {
      // aceita também qualquer verify_token registrado em instâncias oficiais
      const { data } = await admin()
        .from('whatsapp_instances')
        .select('id')
        .eq('channel', 'official')
        .eq('meta_verify_token', token)
        .maybeSingle()
      ok = mode === 'subscribe' && !!data
    }

    if (ok && challenge) return new Response(challenge, { status: 200 })
    return new Response('Forbidden', { status: 403 })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  try {
    const rawBody = await req.text()
    const payload = rawBody ? JSON.parse(rawBody) : {}
    const supabase = admin()

    const entries: any[] = Array.isArray(payload?.entry) ? payload.entry : []
    for (const entry of entries) {
      const changes: any[] = Array.isArray(entry?.changes) ? entry.changes : []
      for (const change of changes) {
        if (change?.field !== 'messages') continue
        const value = change.value || {}
        const phoneNumberId = value?.metadata?.phone_number_id
        if (!phoneNumberId) continue

        // Resolve a instância oficial pelo phone_number_id
        const { data: instance } = await supabase
          .from('whatsapp_instances')
          .select('id, organization_id, meta_app_secret')
          .eq('channel', 'official')
          .eq('meta_phone_number_id', phoneNumberId)
          .maybeSingle()
        if (!instance) {
          console.warn('[meta-whatsapp-webhook] no instance for phone_number_id', phoneNumberId)
          continue
        }

        // Validação de assinatura (best-effort: só se a instância tiver app_secret)
        if (instance.meta_app_secret) {
          const valid = await verifySignature(
            instance.meta_app_secret,
            rawBody,
            req.headers.get('X-Hub-Signature-256'),
          )
          if (!valid) {
            console.warn('[meta-whatsapp-webhook] invalid signature for', phoneNumberId)
            continue
          }
        }

        const orgId = instance.organization_id

        // 1) Status updates (mensagens outbound que enviamos)
        const statuses: any[] = Array.isArray(value?.statuses) ? value.statuses : []
        for (const st of statuses) {
          const messageId = st?.id
          const status = st?.status // sent | delivered | read | failed
          if (!messageId || !status) continue
          const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
          if (status === 'failed' && Array.isArray(st?.errors) && st.errors[0]) {
            update.payload_raw = { error: st.errors[0] }
          }
          await supabase
            .from('whatsapp_messages')
            .update(update)
            .eq('organization_id', orgId)
            .eq('message_id_external', messageId)
        }

        // 2) Mensagens inbound (cliente respondeu)
        const messages: any[] = Array.isArray(value?.messages) ? value.messages : []
        const contacts: any[] = Array.isArray(value?.contacts) ? value.contacts : []
        const senderName = contacts[0]?.profile?.name || null
        for (const msg of messages) {
          const from = msg?.from
          const externalId = msg?.id
          if (!from || !externalId) continue

          // dedupe por message_id_external
          const { data: dupe } = await supabase
            .from('whatsapp_messages')
            .select('id')
            .eq('organization_id', orgId)
            .eq('message_id_external', externalId)
            .maybeSingle()
          if (dupe) continue

          await supabase.from('whatsapp_messages').insert({
            organization_id: orgId,
            instance_id: instance.id,
            phone: from,
            body: extractBody(msg),
            message_type: ['text', 'image', 'audio', 'video', 'document', 'sticker'].includes(msg?.type) ? msg.type : 'text',
            direction: 'inbound',
            status: 'delivered',
            message_id_external: externalId,
            payload_raw: msg,
            sender_name: senderName,
          })

          // Qualquer mensagem inbound (texto ou toque em botão) reabre a janela de 24h
          // do WhatsApp Oficial. Dispara um evento genérico "whatsapp_engaged" pro motor
          // de flows (wz-receiver) — um flow pode escutar isso pra liberar mensagens de
          // sessão (texto livre) que dependem do lead ter acabado de interagir.
          // Best-effort: nunca derruba a ingestão da mensagem se isso falhar.
          try {
            await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/wz-receiver`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({
                platform: 'meta_whatsapp',
                status: 'whatsapp_engaged',
                event: 'whatsapp_engaged',
                phone: from,
                name: senderName,
                metadata: {
                  source: 'meta-whatsapp-webhook',
                  instance_id: instance.id,
                  message_type: msg?.type || 'text',
                  button_text: msg?.type === 'button' || msg?.type === 'interactive' ? extractBody(msg) : null,
                },
              }),
            })
          } catch (engagedErr) {
            console.error('[meta-whatsapp-webhook] whatsapp_engaged forward failed:', engagedErr)
          }
        }
      }
    }

    // Sempre 200 para a Meta não reentregar em loop
    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('meta-whatsapp-webhook error:', err)
    // 200 mesmo em erro de parsing para evitar retentativas infinitas da Meta
    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
