// webinar-redirect — link rastreável de webinário.
// Quando o lead clica no link enviado por WhatsApp, registramos "assistiu" e
// redirecionamos para a sala/replay. Marca tag local + dispara o flow de "assistiu"
// (via wz-receiver com evento custom webinar_attended).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function linkSecret(): string {
  return Deno.env.get('WEBINAR_LINK_SECRET') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 'dev-secret'
}

async function hmacHex(msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(linkSecret()),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Assinatura compartilhada com o executor (processOfficialWhatsAppNode): HMAC de `${phone}|${dest}`
export async function signWebinarLink(phone: string, dest: string): Promise<string> {
  return hmacHex(`${phone}|${dest}`)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const url = new URL(req.url)
    const token = url.searchParams.get('t') || ''
    let phone = (url.searchParams.get('p') || '').replace(/\D/g, '')
    let dest = url.searchParams.get('d') || ''
    const k = url.searchParams.get('k') || ''
    const name = url.searchParams.get('n') || null
    const email = url.searchParams.get('e') || null

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Formato CURTO (?t=): usado quando o destino vai numa variável de template
    // (limite prático de ~150 chars) — o link p/d/k assinado passa de 200 chars.
    // Busca telefone+destino na tabela de tokens; assinatura é implícita (o token
    // só existe porque nós o geramos).
    if (token) {
      const { data: row } = await supabase
        .from('webinar_link_tokens').select('phone, dest').eq('token', token).maybeSingle()
      if (!row) return new Response('Link inválido ou expirado', { status: 404, headers: corsHeaders })
      phone = row.phone
      dest = row.dest
    } else {
      if (!phone || !dest) return new Response('Bad request', { status: 400, headers: corsHeaders })
      // Valida assinatura (evita forjar cliques de terceiros)
      const expected = await hmacHex(`${phone}|${dest}`)
      if (k !== expected) {
        // assinatura inválida: ainda redireciona (não trava o usuário), mas NÃO registra evento
        return Response.redirect(dest, 302)
      }
    }

    // 1) Marca tag local "assistiu" (defensivo — o flow "assistiu" também marca)
    try {
      const { data: leads } = await supabase
        .from('leads').select('id, metadata').eq('phone', phone).limit(1)
      const lead = leads?.[0]
      if (lead) {
        const metadata = lead.metadata || {}
        const tags: string[] = Array.isArray(metadata.tags) ? metadata.tags : []
        if (!tags.includes('assistiu')) tags.push('assistiu')
        metadata.tags = tags
        await supabase.from('leads').update({ metadata }).eq('id', lead.id)
      }
    } catch (e) {
      console.error('[webinar-redirect] tag local falhou:', (e as Error).message)
    }

    // 2) Dispara o flow de "assistiu" (move etapa + cancela sequência + checkout)
    try {
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/wz-receiver`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          apikey: Deno.env.get('SUPABASE_ANON_KEY') || '',
        },
        body: JSON.stringify({ phone, event: 'webinar_attended', name, email }),
      })
    } catch (e) {
      console.error('[webinar-redirect] disparo do flow falhou:', (e as Error).message)
    }

    // 3) Redireciona para o destino real (sala/replay do webinário)
    return Response.redirect(dest, 302)
  } catch (err) {
    console.error('webinar-redirect error:', err)
    return new Response('Erro', { status: 500, headers: corsHeaders })
  }
})
