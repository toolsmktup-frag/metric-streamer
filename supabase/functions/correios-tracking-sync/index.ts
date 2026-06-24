// correios-tracking-sync — atualiza o status de entrega dos pedidos consultando
// a API oficial dos Correios (CWS / SRO Rastro). Roda por cron.
//
// Config (secrets) — enquanto não setados, a função PULA sem erro:
//   CORREIOS_USER, CORREIOS_PASSWORD  → Basic auth do contrato
//   CORREIOS_CARTAO                   → número do cartão de postagem
//   CORREIOS_BASE (opc, default https://api.correios.com.br)
//   CORREIOS_BATCH (opc, default 150)
//
// Auth interna: Bearer == SUPABASE_SERVICE_ROLE_KEY ou TRACKING_DISPATCH_SECRET.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const env = (k: string) => Deno.env.get(k) || "";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function normStatus(desc: string): string {
  const d = (desc || "").toLowerCase();
  if (d.includes("entregue")) return "entregue";
  if (d.includes("saiu para entrega")) return "saiu_entrega";
  if (d.includes("aguardando retirada") || d.includes("disponível para retirada") || d.includes("retirada")) return "aguardando_retirada";
  if (d.includes("devol")) return "devolvido";
  if (d.includes("postado") || d.includes("postagem")) return "postado";
  return "em_transito";
}

function eventAt(ev: any): string | null {
  const raw = ev?.dtHrCriado || ev?.data || null;
  if (!raw) return null;
  // Correios manda horário local (BRT) sem timezone — assume -03:00.
  const s = /[zZ]|[+-]\d\d:?\d\d$/.test(raw) ? raw : `${raw}-03:00`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function eventLoc(ev: any): string | null {
  const u = ev?.unidade?.endereco || ev?.unidade || {};
  const city = u.cidade || u.localidade || null;
  const uf = u.uf || null;
  return [city, uf].filter(Boolean).join("/") || null;
}

async function authenticate(base: string): Promise<string | null> {
  const user = env("CORREIOS_USER"), pass = env("CORREIOS_PASSWORD"), cartao = env("CORREIOS_CARTAO");
  const basic = btoa(`${user}:${pass}`);
  const res = await fetch(`${base}/token/v1/autentica/cartaopostagem`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" },
    body: JSON.stringify({ numero: cartao }),
  });
  if (!res.ok) {
    console.error("[correios] auth falhou", res.status, (await res.text()).slice(0, 200));
    return null;
  }
  const body = await res.json().catch(() => ({}));
  return body?.token || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = req.headers.get("Authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const ownSecret = env("TRACKING_DISPATCH_SECRET");
  if (!((serviceKey && bearer === serviceKey) || (ownSecret && bearer === ownSecret))) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  // Sem credencial → pula (deixa pronto, liga depois)
  if (!env("CORREIOS_USER") || !env("CORREIOS_PASSWORD") || !env("CORREIOS_CARTAO")) {
    return json({ ok: true, skipped: true, reason: "credenciais Correios não configuradas" });
  }

  const base = (env("CORREIOS_BASE") || "https://api.correios.com.br").replace(/\/+$/, "");
  const batch = Number(env("CORREIOS_BATCH") || 150) || 150;
  const supabase = createClient(env("SUPABASE_URL"), serviceKey);

  const token = await authenticate(base);
  if (!token) return json({ ok: false, error: "falha ao autenticar nos Correios" }, 502);

  // Pedidos com rastreio ativo (não entregue), mais antigos primeiro
  const { data: rows, error } = await supabase
    .from("order_shipments")
    .select("id, tracking_code")
    .not("tracking_code", "is", null)
    .eq("tracking_delivered", false)
    .order("tracking_updated_at", { ascending: true, nullsFirst: true })
    .limit(batch);
  if (error) return json({ ok: false, error: error.message }, 500);
  if (!rows?.length) return json({ ok: true, processed: 0 });

  let updated = 0, delivered = 0, errors = 0;
  for (const s of rows as Array<{ id: string; tracking_code: string }>) {
    const code = s.tracking_code.trim().toUpperCase();
    try {
      const res = await fetch(`${base}/srorastro/v1/objetos/${encodeURIComponent(code)}?resultado=U`, {
        headers: { Authorization: token, Accept: "application/json" },
      });
      if (!res.ok) { errors++; await sleep(250); continue; }
      const body = await res.json().catch(() => ({}));
      const obj = (body?.objetos || [])[0];
      const eventos = obj?.eventos || [];
      if (!eventos.length) { await sleep(250); continue; }

      const latest = eventos[0];
      const status = normStatus(latest?.descricao || "");
      const isDelivered = status === "entregue";

      await supabase.from("order_shipments").update({
        tracking_status: status,
        tracking_last_event: latest?.descricao || null,
        tracking_event_at: eventAt(latest),
        tracking_updated_at: new Date().toISOString(),
        tracking_delivered: isDelivered,
      }).eq("id", s.id);

      // histórico (todos os eventos, sem duplicar)
      const evRows = eventos.map((ev: any) => ({
        order_shipment_id: s.id,
        tracking_code: code,
        event_status: normStatus(ev?.descricao || ""),
        event_description: ev?.descricao || null,
        event_location: eventLoc(ev),
        event_at: eventAt(ev),
        raw: ev,
      }));
      await supabase.from("shipment_tracking_events").upsert(evRows, {
        onConflict: "order_shipment_id,event_description,event_at",
        ignoreDuplicates: true,
      });

      updated++;
      if (isDelivered) delivered++;
    } catch (e) {
      console.error("[correios] erro no código", code, e);
      errors++;
    }
    await sleep(250); // pacing — respeita rate limit dos Correios
  }

  return json({ ok: true, processed: rows.length, updated, delivered, errors });
});
