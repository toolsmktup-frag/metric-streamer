// enqueue-tracking-dispatch — disparo CONTROLADO do código de rastreio.
//
// Processa pedidos de envio (order_shipments) com dispatch_status = 'na_fila'.
// Dois canais:
//   • manychat (padrão, à prova de ban): seta o custom field do código e marca a
//     tag de rastreio → o fluxo oficial do WhatsApp dispara no ManyChat.
//   • uazapi: envia direto pelo número, revezando instâncias e variando o texto,
//     com intervalo entre envios para reduzir risco de bloqueio.
//
// Chamada de duas formas:
//   • cron (sem corpo)  → processa um lote da fila com pacing.
//   • { shipment_id }   → dispara um pedido específico.
//
// Auth: Bearer == SUPABASE_SERVICE_ROLE_KEY (cron/pg_net) ou TRACKING_DISPATCH_SECRET.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ORG_ID = "00000000-0000-0000-0000-000000000001";

const DEFAULT_TEMPLATES = [
  "Oi {{nome}}, parabéns pela sua compra! 🌿\n\nSeu pedido da *Santo Mato* já foi postado nos Correios e está a caminho da sua casa. 📦\n\nSeu código de rastreio é:\n*{{codigo}}*\n\nPra acompanhar a entrega, é só tocar aqui:\n{{link}}\n\nQualquer dúvida, pode chamar por aqui! 💚",
  "Olá {{nome}}, tudo bem? 😊\n\nPassando pra te dar uma ótima notícia: seu pedido da *Santo Mato* foi enviado e logo chega até você! 🚚\n\nCódigo de rastreio:\n*{{codigo}}*\n\nAcompanhe sua entrega por aqui:\n{{link}}\n\nObrigado pela confiança! 🌿",
  "{{nome}}, que alegria! 🎉\n\nSeu pedido da *Santo Mato* acabou de ser postado nos Correios. 📦\n\nAnota seu código de rastreio:\n*{{codigo}}*\n\nÉ só acompanhar a entrega aqui:\n{{link}}\n\nQualquer coisa, estamos por aqui! 💚",
];

const env = (k: string) => Deno.env.get(k) || "";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function correiosUrl(code: string): string {
  return `https://rastreamento.correios.com.br/app/index.php?objeto=${encodeURIComponent(code)}`;
}

function fill(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

// Chave canônica BR: ignora o 55 e o 9º dígito (48992112108 ≡ 554892112108).
function brKey(v: string): string {
  let d = (v || "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  if (d.length === 11 && d[2] === "9") d = d.slice(0, 2) + d.slice(3);
  return d;
}

function templates(): string[] {
  try {
    const raw = env("TRACKING_UAZAPI_TEMPLATES");
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length) return arr.map(String);
    }
  } catch { /* usa default */ }
  return DEFAULT_TEMPLATES;
}

interface Shipment {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  product_name: string | null;
  quantity: number;
  tracking_code: string | null;
  carrier: string | null;
  dispatch_channel: "manychat" | "uazapi" | null;
}

async function dispatchManyChat(s: Shipment, link: string): Promise<{ ok: boolean; skip?: boolean; detail?: unknown }> {
  const tagName = env("TRACKING_MC_TAG_NAME");
  const tagId = env("TRACKING_MC_TAG_ID");
  if (!tagName && !tagId) {
    // Canal ainda não configurado → deixa o pedido NA FILA (não marca falha).
    return { ok: false, skip: true, detail: "ManyChat tag não configurada — aguardando" };
  }
  const codeField = env("TRACKING_MC_CODE_FIELD") || "codigo_rastreio";
  const productField = env("TRACKING_MC_PRODUCT_FIELD");
  const fields: Array<Record<string, unknown>> = [{ field_name: codeField, value: s.tracking_code }];
  if (productField && s.product_name) fields.push({ field_name: productField, value: s.product_name });

  const res = await fetch(`${env("SUPABASE_URL")}/functions/v1/manychat-sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env("MANYCHAT_SYNC_SECRET") || env("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify({
      phone: s.customer_phone,
      name: s.customer_name,
      email: s.customer_email,
      tag_name: tagName || undefined,
      tag_id: tagId || undefined,
      fields,
    }),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok && body?.ok !== false, detail: body };
}

async function dispatchUazapi(
  s: Shipment,
  link: string,
  instances: Array<{ api_url: string; api_token: string }>,
  idx: number,
): Promise<{ ok: boolean; skip?: boolean; detail?: unknown }> {
  if (!instances.length) return { ok: false, skip: true, detail: "nenhuma instância UazAPI conectada — aguardando" };
  const inst = instances[idx % instances.length];
  const tpls = templates();
  const tpl = tpls[Math.floor(Math.random() * tpls.length)];
  const text = fill(tpl, {
    nome: (s.customer_name || "").split(" ")[0] || "",
    codigo: s.tracking_code || "",
    produto: s.product_name || "",
    link,
  });
  const number = (s.customer_phone || "").replace(/\D/g, "");
  if (!number) return { ok: false, detail: "telefone vazio" };

  const baseUrl = inst.api_url.replace(/\/+$/, "");
  const res = await fetch(`${baseUrl}/send/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: inst.api_token },
    body: JSON.stringify({ number, text, readchat: true, async: false }),
  });
  const body = await res.text();
  return { ok: res.ok, detail: body.slice(0, 300) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth interna
  const auth = req.headers.get("Authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const ownSecret = env("TRACKING_DISPATCH_SECRET");
  if (!((serviceKey && bearer === serviceKey) || (ownSecret && bearer === ownSecret))) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  const supabase = createClient(env("SUPABASE_URL"), serviceKey);

  let input: any = {};
  try { input = await req.json(); } catch { /* cron sem corpo */ }

  const defaultChannel = (env("TRACKING_DISPATCH_CHANNEL") || "manychat") as "manychat" | "uazapi";
  const batchSize = Number(input.limit ?? env("TRACKING_BATCH_SIZE") ?? 10) || 10;
  const delayMs = Number(env("TRACKING_SEND_DELAY_MS") ?? 4000) || 4000;

  // 1) Seleciona pedidos a disparar
  let query = supabase
    .from("order_shipments")
    .select("id, customer_name, customer_phone, customer_email, product_name, quantity, tracking_code, carrier, dispatch_channel")
    .not("tracking_code", "is", null);

  if (input.shipment_id) {
    query = query.eq("id", input.shipment_id);
  } else {
    query = query.eq("dispatch_status", "na_fila").order("created_at", { ascending: true }).limit(batchSize);
  }

  const { data: shipments, error } = await query;
  if (error) return jsonResponse({ ok: false, error: error.message }, 500);
  if (!shipments?.length) return jsonResponse({ ok: true, processed: 0, message: "fila vazia" });

  // 2) Instâncias UazAPI (revezamento) — só carrega se necessário
  let instances: Array<{ api_url: string; api_token: string }> = [];
  const needsUazapi = shipments.some(
    (s: Shipment) => (s.dispatch_channel || defaultChannel) === "uazapi",
  );
  if (needsUazapi) {
    const { data: inst } = await supabase
      .from("whatsapp_instances")
      .select("api_url, api_token, status, phone_number, instance_name")
      .eq("organization_id", ORG_ID);
    let candidates = (inst || []).filter(
      (i: any) => !i.status || ["connected", "open"].includes(String(i.status).toLowerCase()),
    );
    // Número dedicado: se TRACKING_UAZAPI_PHONE estiver setado, SÓ dispara por ele.
    // Sem match conectado → skip (fila mantida); nunca cai nos números das vendedoras.
    const pinned = brKey(env("TRACKING_UAZAPI_PHONE"));
    if (pinned) {
      candidates = candidates.filter(
        (i: any) => brKey(i.phone_number) === pinned || brKey(i.instance_name) === pinned,
      );
    }
    instances = candidates.map((i: any) => ({ api_url: i.api_url, api_token: i.api_token }));
  }

  // 3) Agrupa duplicados do lote: mesmo telefone + mesmo código → 1 mensagem só
  //    (cliente com 2 pedidos do mesmo envio não recebe texto repetido).
  const keyOf = (s: Shipment) =>
    `${brKey(s.customer_phone || "")}|${(s.tracking_code || "").trim().toUpperCase()}`;
  const groups = new Map<string, Shipment[]>();
  for (const s of shipments as Shipment[]) {
    const g = groups.get(keyOf(s));
    if (g) g.push(s);
    else groups.set(keyOf(s), [s]);
  }
  const groupList = [...groups.values()];

  // 4) Dispara com pacing
  let sent = 0, failed = 0, skipped = 0, deduped = 0, i = 0;
  for (const group of groupList) {
    const s = group[0];
    const channel = (s.dispatch_channel || defaultChannel) as "manychat" | "uazapi";
    const link = s.tracking_code ? correiosUrl(s.tracking_code) : "";

    // Dedupe entre lotes/planilha: código já ENVIADO pra este mesmo telefone
    // (outra linha) → não repete a mensagem, só tira da fila com nota.
    if (!input.shipment_id && s.tracking_code) {
      const { data: prev } = await supabase
        .from("order_shipments")
        .select("id, customer_phone")
        .eq("tracking_code", s.tracking_code)
        .eq("dispatch_status", "enviado");
      const dup = (prev || []).find(
        (p: any) =>
          !group.some((gs) => gs.id === p.id) &&
          brKey(p.customer_phone || "") === brKey(s.customer_phone || ""),
      );
      if (dup) {
        await supabase
          .from("order_shipments")
          .update({
            dispatch_status: "enviado",
            notes: `não disparado: código já enviado a este telefone (pedido ${dup.id})`,
          })
          .in("id", group.map((g) => g.id));
        deduped += group.length;
        continue;
      }
    }

    let result: { ok: boolean; skip?: boolean; detail?: unknown };
    try {
      result = channel === "uazapi"
        ? await dispatchUazapi(s, link, instances, i)
        : await dispatchManyChat(s, link);
    } catch (e) {
      result = { ok: false, detail: String((e as Error)?.message || e) };
    }

    // skip = canal não configurado → mantém NA FILA, processa quando ligar
    if (result.skip) { skipped += group.length; continue; }

    await supabase
      .from("order_shipments")
      .update({
        dispatch_status: result.ok ? "enviado" : "falhou",
        dispatch_channel: channel,
        dispatched_at: result.ok ? new Date().toISOString() : null,
        notes: result.ok ? null : `disparo falhou: ${JSON.stringify(result.detail).slice(0, 280)}`,
      })
      .eq("id", s.id);

    if (group.length > 1) {
      await supabase
        .from("order_shipments")
        .update({
          dispatch_status: result.ok ? "enviado" : "falhou",
          dispatch_channel: channel,
          dispatched_at: result.ok ? new Date().toISOString() : null,
          notes: result.ok
            ? `agrupado: mesma mensagem do pedido ${s.id}`
            : `disparo falhou (agrupado c/ pedido ${s.id})`,
        })
        .in("id", group.slice(1).map((g) => g.id));
      deduped += group.length - 1;
    }

    if (result.ok) sent++; else failed++;
    i++;
    // pacing entre envios (não no último)
    if (i < groupList.length) await sleep(channel === "uazapi" ? delayMs : 600);
  }

  return jsonResponse({ ok: true, processed: shipments.length, sent, failed, skipped, deduped });
});
