// Sales Copilot — assists sellers with AI suggestions based on conversation context
// Streams SSE responses from Anthropic Claude API (Haiku 4.5).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Action = "suggest" | "analyze" | "objection" | "ask";

interface RequestBody {
  action: Action;
  phone: string;
  instance_id: string; // can be 'all'
  custom_question?: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

// Modelo padrão: Claude Haiku 4.5 (rápido + barato). Para "analyze" pode trocar pra sonnet se quiser mais profundidade.
const MODEL_FAST = "claude-haiku-4-5";
const MODEL_DEEP = "claude-haiku-4-5"; // troque pra "claude-sonnet-4-5" se quiser análise mais profunda

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return new Response(JSON.stringify({ error, ...(extra || {}) }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeStr(v: unknown, max = 500): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : (() => {
    try { return JSON.stringify(v); } catch { return String(v); }
  })();
  return s.length > max ? s.slice(0, max) : s;
}

function daysBetween(from: string | Date | null | undefined, to: Date = new Date()): number | null {
  if (!from) return null;
  const d = typeof from === "string" ? new Date(from) : from;
  if (isNaN(d.getTime())) return null;
  return Math.floor((to.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function fmtDate(v: any): string {
  try {
    return new Date(v).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch { return String(v || ""); }
}

function buildSystemPrompt(action: Action, script: string, offersBlock: string, leadCtx: string): string {
  const base = `Você é um copiloto de vendas que AUXILIA vendedores brasileiros via WhatsApp. Você NUNCA responde diretamente o cliente — você fala COM o vendedor, sugerindo o que ele pode mandar. Use português brasileiro informal e direto. Seja prático.

== SCRIPT DE VENDAS DA EMPRESA ==
${script || "(Nenhum script configurado — use bom senso de vendas consultivas)"}

${offersBlock}

== CONTEXTO DO LEAD ==
${leadCtx}

== COMO USAR O CONTEXTO ==
- Se cliente perguntar preço/condição/conteúdo: use SOMENTE o que está em "OFERTAS ATIVAS". NUNCA invente valores, prazos ou conteúdo de produto.
- Quando o cliente está em descoberta ("o que vocês têm?", "me explica"), priorize a oferta marcada como ⭐ DESTAQUE.
- Respeite as "Regras de uso pela IA" de cada oferta (quando ofertar, quando NÃO ofertar, exceções).
- Se o cliente já comprou um produto que está dentro de uma oferta combo, NÃO ofereça o combo cheio — sugira só o que falta.
- Se LTV > R$ 1.000 ou status = "VIP/Recorrente": trate como cliente próximo, tom mais íntimo, agradeça a parceria.
- Se "Dias parado na etapa" > 5: o lead esfriou — sugira mensagem de quebra de gelo / reativação, NÃO continue como se a conversa estivesse quente.
- Se há evento "PIX gerado" ou "Boleto gerado" sem compra aprovada depois: foco total em remover fricção do pagamento (oferecer outra forma, tirar dúvida, lembrar do prazo).
- Se há "Carrinho abandonado": traga de volta com urgência genuína (estoque, bônus, prazo).
- Se status = "Inativo (90+ dias sem comprar)": NÃO trate como lead novo — fale como reaproximação.
- Se status = "Primeira compra recente": foque em pós-venda, ativação, próximo produto da escada de valor.
- Se cidade/estado conhecidos: pode usar referência local sutil (clima, fuso, gíria) se fizer sentido.
- Se UTM mostra origem específica (ex: anúncio FB de produto X): adapte o gancho à dor que aquele anúncio prometeu resolver.
- Se produto mais comprado é conhecido: sugira upsell/cross-sell coerente.
- NUNCA invente dados que não estão no contexto. Se faltar info, peça pro vendedor confirmar.
`;

  switch (action) {
    case "suggest":
      return `${base}

TAREFA: Analise as últimas mensagens da conversa E o contexto do lead, e sugira 2 ou 3 variações de resposta que o vendedor pode mandar AGORA. Use markdown. Numere as opções (1, 2, 3). Cada opção deve ser uma mensagem pronta pra copiar — texto que vai pro WhatsApp do cliente. Diferencie o tom entre as opções (ex: mais direto, mais consultivo, mais empático). Se o contexto do lead indicar algo relevante (ex: parado há X dias, cliente VIP, PIX pendente), AS SUGESTÕES DEVEM REFLETIR ISSO.`;
    case "analyze":
      return `${base}

TAREFA: Faça uma análise rápida da conversa em markdown estruturado, CRUZANDO histórico de chat com o contexto do lead:
- **Temperatura do lead**: 🥶 Frio / 🌤️ Morno / 🔥 Quente (com 1 frase justificando — considere LTV, dias parado, eventos)
- **Perfil**: (novo / recorrente / VIP / inativo / em recuperação) — baseado no histórico financeiro
- **Estágio na jornada**: (descoberta, consideração, decisão, objeção, fechamento, pós-venda)
- **Sinais do contexto**: cite eventos relevantes (ex: "PIX gerado há 2 dias sem pagamento", "parado em 'Aguardando contato' há 7 dias", "veio de anúncio FB - Produto X")
- **Objeções detectadas**: lista
- **Sinais de compra**: lista
- **Próximo passo recomendado**: 1-2 frases concretas e específicas pro caso desse lead

Seja conciso. Sem enrolação.`;
    case "objection":
      return `${base}

TAREFA: O vendedor enfrentou uma objeção e precisa contorná-la. Identifique a objeção (no histórico ou na pergunta livre) e devolva 2-3 abordagens de contorno alinhadas ao script E ao perfil do lead (se é cliente recorrente, se já comprou X, se veio de anúncio Y, etc). Cada uma deve ser uma mensagem pronta pra copiar. Use markdown e numere.`;
    case "ask":
      return `${base}

TAREFA: Responda a pergunta do vendedor de forma prática, baseada no contexto da conversa, no histórico do lead e no script. Se a pergunta for sobre o que mandar, devolva uma mensagem pronta pra copiar.`;
  }
}

function buildUserPrompt(action: Action, messages: any[], customQuestion?: string): string {
  const transcript = messages
    .map((m) => {
      const who = m?.direction === "outbound" ? "Vendedor" : "Cliente";
      let time = "";
      try {
        time = new Date(m?.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
      } catch {
        time = String(m?.created_at || "");
      }
      const raw = m?.body ?? `[${m?.message_type || "mídia"}]`;
      const body = safeStr(raw, 500);
      return `[${time}] ${who}: ${body}`;
    })
    .join("\n");

  let user = `== HISTÓRICO DA CONVERSA (últimas ${messages.length} mensagens) ==\n${transcript || "(sem mensagens)"}`;
  if (customQuestion) {
    user += `\n\n== PERGUNTA / OBJEÇÃO DO VENDEDOR ==\n${safeStr(customQuestion, 2000)}`;
  }
  return user;
}

/**
 * Converte stream SSE da Anthropic pra um formato simples consumido pelo frontend.
 * Frontend espera linhas SSE no formato: `data: {"choices":[{"delta":{"content":"..."}}]}` + `data: [DONE]` no final.
 */
function transformAnthropicStream(upstream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream({
    async start(controller) {
      const reader = upstream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let nl: number;
          while ((nl = buffer.indexOf("\n")) !== -1) {
            let line = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            try {
              const parsed = JSON.parse(jsonStr);
              if (parsed?.type === "content_block_delta") {
                const text = parsed?.delta?.text;
                if (typeof text === "string" && text.length) {
                  const payload = JSON.stringify({
                    choices: [{ delta: { content: text } }],
                  });
                  controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
                }
              } else if (parsed?.type === "message_stop") {
                controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
              } else if (parsed?.type === "error") {
                const errMsg = parsed?.error?.message || "Erro Anthropic";
                const payload = JSON.stringify({
                  choices: [{ delta: { content: `\n\n[Erro: ${errMsg}]` } }],
                });
                controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
              }
            } catch {
              // ignora linha parcial / não-JSON
            }
          }
        }
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
      } catch (e) {
        try {
          const payload = JSON.stringify({
            choices: [{ delta: { content: `\n\n[Stream interrompido]` } }],
          });
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        } catch {}
      } finally {
        try { controller.close(); } catch {}
        try { reader.releaseLock(); } catch {}
      }
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const log = (stage: string, extra?: Record<string, unknown>) => {
    try { console.log(JSON.stringify({ fn: "sales-copilot", stage, ...(extra || {}) })); } catch {}
  };

  try {
    if (!ANTHROPIC_API_KEY) return jsonError(500, "ANTHROPIC_API_KEY não configurada nos secrets da edge function");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonError(401, "Não autenticado");

    let body: RequestBody;
    try {
      body = (await req.json()) as RequestBody;
    } catch {
      return jsonError(400, "JSON inválido");
    }
    if (!body || !body.action || !body.phone) return jsonError(400, "Parâmetros inválidos");

    // Auth client (uses caller's JWT) — to identify the org
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    let userId: string | null = null;
    try {
      const { data: userData } = await userClient.auth.getUser();
      userId = userData?.user?.id ?? null;
    } catch (e) {
      log("auth_error", { err: String(e) });
    }
    if (!userId) return jsonError(401, "Sessão inválida");

    // Service-role client — bypasses RLS to read messages and lead context
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let orgId: string | null = null;
    try {
      const { data: profile } = await admin
        .from("user_profiles")
        .select("organization_id")
        .eq("id", userId)
        .maybeSingle();
      orgId = profile?.organization_id ?? null;
    } catch (e) {
      log("profile_error", { err: String(e) });
    }
    if (!orgId) return jsonError(403, "Usuário sem organização");

    log("start", {
      action: body.action,
      phone: body.phone,
      instance_id: body.instance_id,
      user_id: userId,
      org_id: orgId,
    });

    // ===== Messages (fallback: empty array) =====
    let messages: any[] = [];
    try {
      let msgQuery = admin
        .from("whatsapp_messages")
        .select("id, instance_id, phone, body, message_type, direction, created_at, sender_name")
        .eq("organization_id", orgId)
        .eq("phone", body.phone)
        .order("created_at", { ascending: false })
        .limit(30);
      if (body.instance_id && body.instance_id !== "all") {
        msgQuery = msgQuery.eq("instance_id", body.instance_id);
      }
      const { data: rawMessages, error: msgErr } = await msgQuery;
      if (msgErr) log("messages_error", { err: msgErr.message });
      messages = (rawMessages || []).reverse();
    } catch (e) {
      log("messages_throw", { err: String(e) });
    }

    // ===== Lead context (each block independent) =====
    let leadCtx = `Telefone: ${body.phone}`;
    const phoneDigits = (body.phone || "").replace(/\D/g, "");
    const phoneVariants = Array.from(
      new Set([
        phoneDigits,
        phoneDigits.startsWith("55") ? phoneDigits : `55${phoneDigits}`,
        phoneDigits.startsWith("55") ? phoneDigits.slice(2) : phoneDigits,
      ].filter(Boolean)),
    );

    let lead: any = null;
    try {
      const { data: leads, error: leadErr } = await admin
        .from("leads")
        .select("id, name, email, phone, tags, utm_source, utm_medium, utm_campaign, utm_content, utm_term, metadata, created_at")
        .eq("organization_id", orgId)
        .in("phone", phoneVariants.length ? phoneVariants : [body.phone])
        .limit(1);
      if (leadErr) log("lead_error", { err: leadErr.message });
      lead = leads?.[0] || null;
    } catch (e) {
      log("lead_throw", { err: String(e) });
    }

    if (lead) {
      const tagsStr = Array.isArray(lead.tags) && lead.tags.length ? lead.tags.join(", ") : "(nenhuma)";
      const leadAgeDays = daysBetween(lead.created_at);

      // --- Endereço (de metadata) ---
      const meta = (lead.metadata || {}) as Record<string, any>;
      const addressBits = [meta.city, meta.state].filter(Boolean).join("/");
      const addressStr = addressBits ? `${addressBits}` : (meta.cep ? `CEP ${meta.cep}` : "");

      // --- UTMs ---
      const utmParts: string[] = [];
      if (lead.utm_source) utmParts.push(`source=${lead.utm_source}`);
      if (lead.utm_medium) utmParts.push(`medium=${lead.utm_medium}`);
      if (lead.utm_campaign) utmParts.push(`campaign=${lead.utm_campaign}`);
      if (lead.utm_content) utmParts.push(`content=${lead.utm_content}`);
      if (lead.utm_term) utmParts.push(`term=${lead.utm_term}`);
      const utmStr = utmParts.length ? utmParts.join(" | ") : "(sem UTM — origem desconhecida)";

      leadCtx = `Nome: ${lead.name || "(sem nome)"}
Telefone: ${lead.phone || body.phone}
Email: ${lead.email || "(sem email)"}
Tags: ${tagsStr}
Lead criado há: ${leadAgeDays !== null ? `${leadAgeDays} dias` : "(desconhecido)"}
${addressStr ? `Localização: ${addressStr}` : ""}
Origem (UTM): ${utmStr}`.replace(/\n\n+/g, "\n");

      // ===== Roda em paralelo: stage, customer/purchases, events =====
      const [stageRes, customerRes, eventsRes] = await Promise.allSettled([
        // Stage / funnel + entered_at pra calcular tempo parado
        admin
          .from("lead_stage_positions")
          .select("funnel_id, stage_id, entered_at")
          .eq("lead_id", lead.id)
          .limit(10),
        // Unified customer
        (lead.email
          ? admin
              .from("unified_customers")
              .select("id, lifetime_value, total_purchases, primary_email, primary_phone")
              .eq("organization_id", orgId)
              .eq("primary_email", String(lead.email).toLowerCase())
              .limit(1)
          : admin
              .from("unified_customers")
              .select("id, lifetime_value, total_purchases, primary_email, primary_phone")
              .eq("organization_id", orgId)
              .in("primary_phone", phoneVariants.length ? phoneVariants : [body.phone])
              .limit(1)),
        // Eventos do lead
        admin
          .from("lead_events")
          .select("event_name, metadata, created_at, funnel_id")
          .eq("lead_id", lead.id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      // ----- Stage / funnel -----
      let stagePositions: any[] = [];
      if (stageRes.status === "fulfilled") {
        stagePositions = (stageRes.value as any).data || [];
      } else {
        log("stage_pos_error", { err: String((stageRes as any).reason) });
      }

      if (stagePositions.length) {
        try {
          const funnelIds = Array.from(new Set(stagePositions.map((s: any) => s.funnel_id).filter(Boolean)));
          const stageIds = Array.from(new Set(stagePositions.map((s: any) => s.stage_id).filter(Boolean)));

          const [funnelsRes, stagesRes] = await Promise.allSettled([
            funnelIds.length
              ? admin.from("lead_funnels").select("id, name").in("id", funnelIds)
              : Promise.resolve({ data: [] as any[] }),
            stageIds.length
              ? admin.from("lead_funnel_stages").select("id, name").in("id", stageIds)
              : Promise.resolve({ data: [] as any[] }),
          ]);

          const funnelMap = new Map<string, string>();
          const stageMap = new Map<string, string>();
          if (funnelsRes.status === "fulfilled") {
            for (const f of (funnelsRes.value as any).data || []) funnelMap.set(f.id, f.name);
          }
          if (stagesRes.status === "fulfilled") {
            for (const s of (stagesRes.value as any).data || []) stageMap.set(s.id, s.name);
          }

          const stagesStr = stagePositions
            .map((s: any) => {
              const fname = funnelMap.get(s.funnel_id) || "?";
              const sname = stageMap.get(s.stage_id) || "?";
              const dStop = daysBetween(s.entered_at);
              const dStr = dStop !== null ? ` [parado há ${dStop}d]` : "";
              return `${fname} → ${sname}${dStr}`;
            })
            .join(" | ");
          leadCtx += `\nFunis/Etapas: ${stagesStr}`;
        } catch (e) {
          log("stage_join_throw", { err: String(e) });
        }
      }

      // ----- LTV / purchases -----
      let customer: any = null;
      if (customerRes.status === "fulfilled") {
        customer = ((customerRes.value as any).data || [])[0] || null;
      } else {
        log("customer_error", { err: String((customerRes as any).reason) });
      }

      if (customer) {
        const ltv = Number(customer.lifetime_value || 0);
        leadCtx += `\nLTV: R$ ${ltv.toFixed(2)} (${customer.total_purchases || 0} compras)`;

        try {
          const { data: purchases } = await admin
            .from("customer_purchases")
            .select("product_name, gross_amount, net_amount, status, purchased_at, payment_method, installments, offer_name")
            .eq("unified_customer_id", customer.id)
            .order("purchased_at", { ascending: false })
            .limit(15);

          const list = purchases || [];
          if (list.length) {
            const approved = list.filter((p: any) => p.status === "authorized" || p.status === "approved");
            const lastApproved = approved[0];
            const daysSinceLast = lastApproved ? daysBetween(lastApproved.purchased_at) : null;

            // Ticket médio
            const totalApproved = approved.reduce((sum: number, p: any) => sum + Number(p.net_amount ?? p.gross_amount ?? 0), 0);
            const ticketMedio = approved.length ? totalApproved / approved.length : 0;

            // Produto mais comprado
            const productCount: Record<string, number> = {};
            for (const p of approved) {
              const k = p.product_name || "(sem nome)";
              productCount[k] = (productCount[k] || 0) + 1;
            }
            const topProduct = Object.entries(productCount).sort((a, b) => b[1] - a[1])[0];

            // Método de pagamento favorito
            const payCount: Record<string, number> = {};
            for (const p of approved) {
              if (!p.payment_method) continue;
              payCount[p.payment_method] = (payCount[p.payment_method] || 0) + 1;
            }
            const topPay = Object.entries(payCount).sort((a, b) => b[1] - a[1])[0];

            // Status do cliente
            let clientStatus = "Lead (sem compra aprovada)";
            if (approved.length === 1) clientStatus = "Primeira compra";
            else if (approved.length >= 2 && approved.length <= 4) clientStatus = "Cliente recorrente";
            else if (approved.length >= 5) clientStatus = "Cliente VIP";
            if (daysSinceLast !== null && daysSinceLast > 90 && approved.length > 0) {
              clientStatus += " (INATIVO há " + daysSinceLast + " dias)";
            }

            leadCtx += `\nStatus do cliente: ${clientStatus}`;
            if (approved.length) {
              leadCtx += `\nTicket médio: R$ ${ticketMedio.toFixed(2)}`;
              if (daysSinceLast !== null) leadCtx += ` | Última compra aprovada: ${daysSinceLast} dias atrás`;
              if (topProduct) leadCtx += `\nProduto mais comprado: ${topProduct[0]} (${topProduct[1]}x)`;
              if (topPay) leadCtx += ` | Pagamento favorito: ${topPay[0]}`;
            }

            // Lista resumida das últimas compras (top 8 pra não estourar contexto)
            const recent = list.slice(0, 8).map((p: any) => {
              const v = Number(p.net_amount ?? p.gross_amount ?? 0).toFixed(2);
              const inst = p.installments && p.installments > 1 ? ` ${p.installments}x` : "";
              return `${fmtDate(p.purchased_at)} • ${p.product_name} • R$ ${v}${inst} • ${p.status}`;
            }).join("\n  - ");
            leadCtx += `\nÚltimas compras:\n  - ${recent}`;
          } else {
            leadCtx += `\nStatus do cliente: Lead (sem histórico de compras registrado)`;
          }
        } catch (e) {
          log("purchases_throw", { err: String(e) });
        }
      } else {
        leadCtx += `\nStatus do cliente: Lead novo (não identificado em unified_customers)`;
      }

      // ----- Eventos do lead -----
      if (eventsRes.status === "fulfilled") {
        const events = ((eventsRes.value as any).data || []) as any[];
        if (events.length) {
          const eventsStr = events.slice(0, 15).map((e: any) => {
            const d = fmtDate(e.created_at);
            const meta = e.metadata && typeof e.metadata === "object"
              ? Object.entries(e.metadata)
                  .filter(([k]) => !["funnel_id", "from_stage_id", "to_stage_id"].includes(k))
                  .slice(0, 3)
                  .map(([k, v]) => `${k}=${safeStr(v, 50)}`)
                  .join(", ")
              : "";
            return `${d} • ${e.event_name}${meta ? ` (${meta})` : ""}`;
          }).join("\n  - ");
          leadCtx += `\nÚltimos eventos do lead:\n  - ${eventsStr}`;
        }
      } else {
        log("events_error", { err: String((eventsRes as any).reason) });
      }
    }

    // ===== Active script (independent) =====
    let script = "";
    try {
      const { data: scripts, error: scriptErr } = await admin
        .from("sales_copilot_scripts")
        .select("content")
        .eq("organization_id", orgId)
        .eq("is_default", true)
        .limit(1);
      if (scriptErr) log("script_error", { err: scriptErr.message });
      script = scripts?.[0]?.content || "";
    } catch (e) {
      log("script_throw", { err: String(e) });
    }

    // ===== Active offers (independent) =====
    let offersBlock = "";
    try {
      const { data: offers, error: offersErr } = await admin
        .from("sales_copilot_offers")
        .select("name, is_featured, short_description, price_promo, price_full, access_period, composition, target_audience, ai_rules, sort_order")
        .eq("organization_id", orgId)
        .eq("status", "active")
        .order("is_featured", { ascending: false })
        .order("sort_order", { ascending: true });
      if (offersErr) log("offers_error", { err: offersErr.message });

      const list = offers || [];
      if (list.length) {
        const sections = list.map((o: any) => {
          const lines: string[] = [];
          const title = o.is_featured
            ? `### ⭐ ${o.name} (DESTAQUE — oferta principal agora)`
            : `### ${o.name}`;
          lines.push(title);
          if (o.short_description) lines.push(`Resumo: ${safeStr(o.short_description, 300)}`);
          if (o.price_promo) lines.push(`Preço: ${safeStr(o.price_promo, 200)}`);
          if (o.price_full) lines.push(`Preço cheio (referência): ${safeStr(o.price_full, 200)}`);
          if (o.access_period) lines.push(`Acesso: ${safeStr(o.access_period, 200)}`);
          if (o.composition) lines.push(`Composição:\n${safeStr(o.composition, 1500)}`);
          if (o.target_audience) lines.push(`Pra quem é: ${safeStr(o.target_audience, 400)}`);
          if (o.ai_rules) lines.push(`Regras: ${safeStr(o.ai_rules, 600)}`);
          return lines.join("\n");
        });
        offersBlock = `== OFERTAS ATIVAS ==\n${sections.join("\n\n")}`;
      } else {
        offersBlock = `== OFERTAS ATIVAS ==\n(Nenhuma oferta cadastrada — não invente valores ou condições. Se o cliente perguntar preço, peça pro vendedor confirmar com a equipe comercial.)`;
      }
    } catch (e) {
      log("offers_throw", { err: String(e) });
      offersBlock = `== OFERTAS ATIVAS ==\n(Erro ao carregar ofertas — peça pro vendedor confirmar valores.)`;
    }

    const systemPrompt = buildSystemPrompt(body.action, script, offersBlock, leadCtx);
    const userPrompt = buildUserPrompt(body.action, messages, body.custom_question);

    const model = body.action === "analyze" ? MODEL_DEEP : MODEL_FAST;

    log("ai_call", {
      model,
      msg_count: messages.length,
      has_lead: !!lead,
      has_script: !!script,
      offers_chars: offersBlock.length,
      lead_ctx_chars: leadCtx.length,
    });

    let aiResp: Response;
    try {
      aiResp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 1500,
          system: systemPrompt,
          messages: [
            { role: "user", content: userPrompt },
          ],
          stream: true,
        }),
      });
    } catch (e) {
      log("ai_fetch_throw", { err: String(e) });
      return jsonError(502, "Falha ao contatar Anthropic");
    }

    if (!aiResp.ok) {
      let errText = "";
      try { errText = await aiResp.text(); } catch {}
      log("anthropic_error", { status: aiResp.status, body: errText.slice(0, 500) });
      if (aiResp.status === 429) return jsonError(429, "Limite de uso da Anthropic atingido. Aguarde alguns instantes.");
      if (aiResp.status === 401) return jsonError(401, "ANTHROPIC_API_KEY inválida.");
      if (aiResp.status === 400) return jsonError(400, `Requisição inválida: ${errText.slice(0, 200)}`);
      return jsonError(502, "Erro na API da Anthropic");
    }

    if (!aiResp.body) return jsonError(502, "Sem corpo de resposta da Anthropic");

    const transformed = transformAnthropicStream(aiResp.body);

    return new Response(transformed, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (e) {
    console.error("sales-copilot fatal:", e);
    return jsonError(500, e instanceof Error ? e.message : "Erro desconhecido");
  }
});
