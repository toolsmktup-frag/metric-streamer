// ============================================================================
// scheduled-messages-dispatch — o "carteiro" das mensagens programadas.
//
// Roda a cada minuto (cron → trigger_scheduled_messages). Pega o que venceu e
// envia pela MESMA instância que a vendedora usava, gravando a mensagem em
// whatsapp_messages para ela aparecer normalmente na conversa.
//
// Fala direto com a UAZAPI (mesmo contrato do whatsapp-send) porque aqui não há
// usuário logado — a autorização já foi feita quando a vendedora agendou.
// Não altera nenhuma função existente.
// ============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_ATTEMPTS = 3          // 1ª tentativa + 2 retentativas
const BATCH_SIZE = 25           // teto por rodada (a cada minuto)
const MAX_LATE_HOURS = 24       // mais atrasado que isso, não envia (evita susto)

/** Mesma normalização do whatsapp-send: 'audio' vira nota de voz (ptt). */
function mapMediaType(messageType: string): string {
  if (messageType === 'audio') return 'ptt'
  return messageType
}

async function sendViaUazapi(
  apiUrl: string,
  apiToken: string,
  phone: string,
  body: string,
  messageType: string,
  mediaUrl?: string | null,
): Promise<{ ok: boolean; externalId: string | null; raw: unknown; error?: string }> {
  const baseUrl = apiUrl.replace(/\/$/, '')
  const isMedia = messageType !== 'text' && !!mediaUrl

  const payload = isMedia
    ? { number: phone, type: mapMediaType(messageType), file: mediaUrl, ...(body ? { text: body } : {}) }
    : { number: phone, text: body }

  const url = `${baseUrl}${isMedia ? '/send/media' : '/send/text'}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', token: apiToken },
    body: JSON.stringify(payload),
  })

  const text = await res.text()
  let data: any = null
  try { data = JSON.parse(text) } catch { data = { raw: text } }

  if (!res.ok) {
    return { ok: false, externalId: null, raw: data, error: `UAZAPI ${res.status}: ${text.slice(0, 300)}` }
  }

  const externalId =
    data?.keyId || data?.key?.id || data?.messageId || data?.id || null

  return { ok: true, externalId, raw: data }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Auth própria por segredo (a função é chamada pelo cron, sem usuário logado).
  const expected = Deno.env.get('SCHEDULED_MESSAGES_SECRET')
  const authHeader = req.headers.get('Authorization') || ''
  const provided = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const nowIso = new Date().toISOString()
  const tooLateIso = new Date(Date.now() - MAX_LATE_HOURS * 3600_000).toISOString()

  const { data: due, error: dueErr } = await admin
    .from('scheduled_messages')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_for', nowIso)
    .gte('scheduled_for', tooLateIso)
    .order('scheduled_for', { ascending: true })
    .limit(BATCH_SIZE)

  if (dueErr) {
    console.error('[scheduled-dispatch] erro ao ler fila:', dueErr.message)
    return new Response(JSON.stringify({ error: dueErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Expira o que ficou parado além da janela (ex.: sistema fora do ar por 1 dia).
  await admin
    .from('scheduled_messages')
    .update({ status: 'failed', last_error: `Não enviada: passou de ${MAX_LATE_HOURS}h do horário agendado.` })
    .eq('status', 'scheduled')
    .lt('scheduled_for', tooLateIso)

  const results = { processadas: 0, enviadas: 0, falhas: 0, retentativas: 0 }

  for (const row of due || []) {
    results.processadas++

    // Trava otimista: marca a tentativa ANTES de enviar. Se duas execuções do
    // cron se cruzarem, a segunda não pega a mesma linha (o update condicional
    // em attempts falha) — evita mensagem duplicada no cliente.
    const { data: claimed, error: claimErr } = await admin
      .from('scheduled_messages')
      .update({ attempts: row.attempts + 1 })
      .eq('id', row.id)
      .eq('attempts', row.attempts)
      .eq('status', 'scheduled')
      .select('id')
      .maybeSingle()

    if (claimErr || !claimed) {
      console.log('[scheduled-dispatch] linha já processada por outra execução:', row.id)
      continue
    }

    try {
      const { data: instance, error: instErr } = await admin
        .from('whatsapp_instances')
        .select('id, api_url, api_token, organization_id')
        .eq('id', row.instance_id)
        .maybeSingle()

      if (instErr || !instance?.api_url || !instance?.api_token) {
        throw new Error('Número (instância) não encontrado ou sem credenciais.')
      }

      const { data: canonical } = await admin.rpc('br_canonical_phone', { p_phone: row.phone })
      const phone = (typeof canonical === 'string' && canonical) || row.phone

      const sent = await sendViaUazapi(
        instance.api_url,
        instance.api_token,
        phone,
        row.body || '',
        row.message_type,
        row.media_url,
      )

      if (!sent.ok) throw new Error(sent.error || 'Falha no envio')

      // Grava na conversa para aparecer no chat como qualquer mensagem enviada.
      const { data: savedMsg } = await admin
        .from('whatsapp_messages')
        .insert({
          organization_id: row.organization_id,
          instance_id: row.instance_id,
          phone,
          body: row.body || '',
          message_type: row.message_type,
          direction: 'outbound',
          status: 'sent',
          media_url: row.media_url,
          media_mime_type: row.media_mime_type,
          message_id_external: sent.externalId,
          payload_raw: sent.raw,
          lead_id: row.lead_id,
        })
        .select('id')
        .maybeSingle()

      await admin
        .from('scheduled_messages')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          sent_message_id: savedMsg?.id || null,
          last_error: null,
        })
        .eq('id', row.id)

      results.enviadas++
      console.log('[scheduled-dispatch] enviada', row.id, '→', phone)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const esgotou = row.attempts + 1 >= MAX_ATTEMPTS

      await admin
        .from('scheduled_messages')
        .update({
          status: esgotou ? 'failed' : 'scheduled',
          last_error: msg.slice(0, 500),
        })
        .eq('id', row.id)

      if (esgotou) results.falhas++
      else results.retentativas++

      console.error('[scheduled-dispatch] erro em', row.id, msg)
    }
  }

  return new Response(JSON.stringify({ ok: true, ...results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
