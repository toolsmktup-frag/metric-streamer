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
  "Oi {{nome}}, parabéns pela sua compra! 🌿\n\nSeu pedido da *{{produto}}* já foi postado nos Correios e está a caminho da sua casa. 📦\n\nSeu código de rastreio é:\n*{{codigo}}*\n\nPra acompanhar a entrega, é só tocar aqui:\n{{link}}\n\nQualquer dúvida, pode chamar por aqui! 💚",
  "Olá {{nome}}, tudo bem? 😊\n\nPassando pra te dar uma ótima notícia: seu pedido da *{{produto}}* foi enviado e logo chega até você! 🚚\n\nCódigo de rastreio:\n*{{codigo}}*\n\nAcompanhe sua entrega por aqui:\n{{link}}\n\nObrigado pela confiança! 🌿",
  "{{nome}}, que alegria! 🎉\n\nSeu pedido da *{{produto}}* acabou de ser postado nos Correios. 📦\n\nAnota seu código de rastreio:\n*{{codigo}}*\n\nÉ só acompanhar a entrega aqui:\n{{link}}\n\nQualquer coisa, estamos por aqui! 💚",
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

// Config vinda do painel da tela /rastreios (tabela de 1 linha).
// Precedência de cada campo: tabela → ENV → default.
interface DispatchSettings {
  enabled: boolean;
  channel: "manychat" | "uazapi";
  uazapi_phone: string;
  templates: string[];
  batch_size: number;
  send_delay_ms: number;
  mc_tag_name: string;
  mc_code_field: string;
  /** >0 = ritmo espaçado: 1 mensagem a cada N minutos (aquecimento). */
  send_gap_minutes: number;
  queue_order: "oldest_first" | "newest_first";
  /** Janela BRT [start, end); start === end desativa. */
  send_window_start: number;
  send_window_end: number;
}

async function loadSettings(supabase: ReturnType<typeof createClient>): Promise<DispatchSettings> {
  const { data } = await supabase
    .from("tracking_dispatch_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  const row: any = data || {};
  const tplsFromRow = Array.isArray(row.templates) ? row.templates.map(String).filter(Boolean) : [];
  return {
    // Sem linha na tabela (migration ainda não aplicada), o ENV segue mandando
    // — e sem ENV o comportamento antigo se mantém (manychat sem tag = fila espera).
    enabled: data ? Boolean(row.enabled) : true,
    channel: (row.channel || env("TRACKING_DISPATCH_CHANNEL") || "manychat") as "manychat" | "uazapi",
    uazapi_phone: row.uazapi_phone || env("TRACKING_UAZAPI_PHONE") || "",
    templates: tplsFromRow.length ? tplsFromRow : templatesFromEnv(),
    batch_size: Number(row.batch_size) || Number(env("TRACKING_BATCH_SIZE")) || 10,
    send_delay_ms: Number(row.send_delay_ms) || Number(env("TRACKING_SEND_DELAY_MS")) || 4000,
    mc_tag_name: row.mc_tag_name || env("TRACKING_MC_TAG_NAME") || "",
    mc_code_field: row.mc_code_field || env("TRACKING_MC_CODE_FIELD") || "codigo_rastreio",
    send_gap_minutes: Number(row.send_gap_minutes) || 0,
    queue_order: row.queue_order === "newest_first" ? "newest_first" : "oldest_first",
    send_window_start: Number.isFinite(Number(row.send_window_start)) ? Number(row.send_window_start) : 0,
    send_window_end: Number.isFinite(Number(row.send_window_end)) ? Number(row.send_window_end) : 0,
  };
}

// Hora atual no fuso de Brasília (o cron do Postgres roda em UTC).
function brtHour(): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" })
      .format(new Date()),
  ) % 24;
}

// Instâncias UazAPI conectadas, respeitando o número dedicado do painel:
// se uazapi_phone estiver setado, SÓ dispara por ele (match por brKey em
// phone_number/instance_name). Sem match conectado → lista vazia → skip
// (fila mantida); nunca cai nos números das vendedoras.
async function loadUazapiInstances(
  supabase: ReturnType<typeof createClient>,
  cfg: DispatchSettings,
): Promise<Array<{ api_url: string; api_token: string }>> {
  const { data: inst } = await supabase
    .from("whatsapp_instances")
    .select("api_url, api_token, status, phone_number, instance_name")
    .eq("organization_id", ORG_ID);
  let candidates = (inst || []).filter(
    (i: any) => !i.status || ["connected", "open"].includes(String(i.status).toLowerCase()),
  );
  const pinned = brKey(cfg.uazapi_phone);
  if (pinned) {
    candidates = candidates.filter(
      (i: any) => brKey(i.phone_number) === pinned || brKey(i.instance_name) === pinned,
    );
  }
  return candidates.map((i: any) => ({ api_url: i.api_url, api_token: i.api_token }));
}

// Marca a citar na mensagem: busca o display_name cadastrado no catálogo
// shipping_products (mesmo padrão de match de is_shipping_product()); sem
// bater nenhum padrão, cai pro nome bruto do produto vendido.
async function getShippingDisplayName(
  supabase: ReturnType<typeof createClient>,
  productName: string | null,
): Promise<string> {
  if (!productName) return "";
  const { data } = await supabase.rpc("get_shipping_display_name", { p_name: productName });
  return (typeof data === "string" && data) || productName;
}

function templatesFromEnv(): string[] {
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

async function dispatchManyChat(s: Shipment, link: string, cfg: DispatchSettings): Promise<{ ok: boolean; skip?: boolean; detail?: unknown }> {
  const tagName = cfg.mc_tag_name;
  const tagId = env("TRACKING_MC_TAG_ID");
  if (!tagName && !tagId) {
    // Canal ainda não configurado → deixa o pedido NA FILA (não marca falha).
    return { ok: false, skip: true, detail: "ManyChat tag não configurada — aguardando" };
  }
  const codeField = cfg.mc_code_field;
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
  supabase: ReturnType<typeof createClient>,
  s: Shipment,
  link: string,
  instances: Array<{ api_url: string; api_token: string }>,
  idx: number,
  cfg: DispatchSettings,
): Promise<{ ok: boolean; skip?: boolean; detail?: unknown }> {
  if (!instances.length) return { ok: false, skip: true, detail: "nenhuma instância UazAPI conectada — aguardando" };
  const inst = instances[idx % instances.length];
  const tpls = cfg.templates.length ? cfg.templates : DEFAULT_TEMPLATES;
  const tpl = tpls[Math.floor(Math.random() * tpls.length)];
  const text = fill(tpl, {
    nome: (s.customer_name || "").split(" ")[0] || "",
    codigo: s.tracking_code || "",
    produto: await getShippingDisplayName(supabase, s.product_name),
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
  const isInternal = (serviceKey && bearer === serviceKey) || (ownSecret && bearer === ownSecret);

  const supabase = createClient(env("SUPABASE_URL"), serviceKey);

  let input: any = {};
  try { input = await req.json(); } catch { /* cron sem corpo */ }

  if (!isInternal) {
    // Usuário logado no app pode SOMENTE usar o modo teste do painel
    // (mandar 1 msg pro próprio número) — nunca processar a fila.
    const isTest = Boolean(input.test?.phone);
    const { data: userData } = isTest
      ? await supabase.auth.getUser(bearer)
      : { data: { user: null } };
    if (!isTest || !userData?.user) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }
  }

  const cfg = await loadSettings(supabase);
  const defaultChannel = cfg.channel;
  const batchSize = Number(input.limit) || cfg.batch_size;
  const delayMs = cfg.send_delay_ms;

  // Modo TESTE (botão "Enviar teste" do painel): manda 1 mensagem pro
  // telefone informado pelo canal configurado, SEM tocar na fila.
  // Funciona mesmo com o disparo desligado — é pra validar antes de ligar.
  if (input.test?.phone) {
    const fake: Shipment = {
      id: "teste",
      customer_name: String(input.test.name || "Teste"),
      customer_phone: String(input.test.phone),
      customer_email: null,
      product_name: String(input.test.product || "Pedido de teste"),
      quantity: 1,
      tracking_code: String(input.test.code || "AA123456785BR"),
      carrier: "Correios",
      dispatch_channel: null,
    };
    const link = correiosUrl(fake.tracking_code!);
    let instances: Array<{ api_url: string; api_token: string }> = [];
    if (defaultChannel === "uazapi") {
      instances = await loadUazapiInstances(supabase, cfg);
    }
    const result = defaultChannel === "uazapi"
      ? await dispatchUazapi(supabase, fake, link, instances, 0, cfg)
      : await dispatchManyChat(fake, link, cfg);
    return jsonResponse({ ok: result.ok, test: true, skip: result.skip || false, detail: result.detail });
  }

  // Chave-geral do painel: desligado → não processa nada, fila acumula.
  if (!cfg.enabled) {
    return jsonResponse({ ok: true, processed: 0, message: "disparo desligado no painel" });
  }

  // Regras de ritmo — só pro processamento da fila via cron
  // (disparo manual de 1 pedido via shipment_id passa direto).
  if (!input.shipment_id) {
    // Janela de horário (BRT): fora dela, a fila espera.
    if (cfg.send_window_start !== cfg.send_window_end) {
      const h = brtHour();
      const inWindow = cfg.send_window_start < cfg.send_window_end
        ? h >= cfg.send_window_start && h < cfg.send_window_end
        : h >= cfg.send_window_start || h < cfg.send_window_end; // janela que cruza a meia-noite
      if (!inWindow) {
        return jsonResponse({ ok: true, processed: 0, message: `fora da janela ${cfg.send_window_start}h–${cfg.send_window_end}h BRT` });
      }
    }
    // Ritmo espaçado: 1 mensagem a cada N minutos.
    if (cfg.send_gap_minutes > 0) {
      const since = new Date(Date.now() - cfg.send_gap_minutes * 60_000).toISOString();
      const { count } = await supabase
        .from("order_shipments")
        .select("id", { count: "exact", head: true })
        .gte("dispatched_at", since);
      if ((count || 0) > 0) {
        return jsonResponse({ ok: true, processed: 0, message: `aguardando intervalo de ${cfg.send_gap_minutes} min` });
      }
    }
  }

  // 1) Seleciona pedidos a disparar
  let query = supabase
    .from("order_shipments")
    .select("id, customer_name, customer_phone, customer_email, product_name, quantity, tracking_code, carrier, dispatch_channel")
    .not("tracking_code", "is", null);

  if (input.shipment_id) {
    query = query.eq("id", input.shipment_id);
  } else {
    // Ritmo espaçado força 1 por execução; ordem configurável no painel.
    const effectiveBatch = cfg.send_gap_minutes > 0 ? 1 : batchSize;
    query = query
      .eq("dispatch_status", "na_fila")
      .order("created_at", { ascending: cfg.queue_order !== "newest_first" })
      .limit(effectiveBatch);
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
    instances = await loadUazapiInstances(supabase, cfg);
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
        ? await dispatchUazapi(supabase, s, link, instances, i, cfg)
        : await dispatchManyChat(s, link, cfg);
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
