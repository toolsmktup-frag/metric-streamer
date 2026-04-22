// Sales Copilot — assists sellers with AI suggestions based on conversation context
// Streams SSE responses from the Lovable AI Gateway.
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
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

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

function buildSystemPrompt(action: Action, script: string, leadCtx: string): string {
  const base = `Você é um copiloto de vendas que AUXILIA vendedores brasileiros via WhatsApp. Você NUNCA responde diretamente o cliente — você fala COM o vendedor, sugerindo o que ele pode mandar. Use português brasileiro informal e direto. Seja prático.

== SCRIPT DE VENDAS DA EMPRESA ==
${script || "(Nenhum script configurado — use bom senso de vendas consultivas)"}

== CONTEXTO DO LEAD ==
${leadCtx}
`;

  switch (action) {
    case "suggest":
      return `${base}

TAREFA: Analise as últimas mensagens da conversa e sugira 2 ou 3 variações de resposta que o vendedor pode mandar AGORA. Use markdown. Numere as opções (1, 2, 3). Cada opção deve ser uma mensagem pronta pra copiar — texto que vai pro WhatsApp do cliente. Diferencie o tom entre as opções (ex: mais direto, mais consultivo, mais empático).`;
    case "analyze":
      return `${base}

TAREFA: Faça uma análise rápida da conversa em markdown estruturado:
- **Temperatura do lead**: 🥶 Frio / 🌤️ Morno / 🔥 Quente (com 1 frase justificando)
- **Estágio na jornada**: (descoberta, consideração, decisão, objeção, fechamento, pós-venda)
- **Objeções detectadas**: lista
- **Sinais de compra**: lista
- **Próximo passo recomendado**: 1-2 frases concretas

Seja conciso. Sem enrolação.`;
    case "objection":
      return `${base}

TAREFA: O vendedor enfrentou uma objeção e precisa contorná-la. Identifique a objeção (no histórico ou na pergunta livre) e devolva 2-3 abordagens de contorno alinhadas ao script. Cada uma deve ser uma mensagem pronta pra copiar. Use markdown e numere.`;
    case "ask":
      return `${base}

TAREFA: Responda a pergunta do vendedor de forma prática, baseada no contexto da conversa e no script. Se a pergunta for sobre o que mandar, devolva uma mensagem pronta pra copiar.`;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const log = (stage: string, extra?: Record<string, unknown>) => {
    try { console.log(JSON.stringify({ fn: "sales-copilot", stage, ...(extra || {}) })); } catch {}
  };

  try {
    if (!LOVABLE_API_KEY) return jsonError(500, "LOVABLE_API_KEY não configurada");

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
        .select("id, name, email, phone, tags")
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
      leadCtx = `Nome: ${lead.name || "(sem nome)"}\nTelefone: ${lead.phone || body.phone}\nEmail: ${lead.email || "(sem email)"}\nTags: ${tagsStr}`;

      // ===== Stage / funnel (independent, simplified to avoid fragile joins) =====
      try {
        const { data: stagePos, error: spErr } = await admin
          .from("lead_stage_positions")
          .select("funnel_id, stage_id")
          .eq("lead_id", lead.id)
          .limit(5);
        if (spErr) log("stage_pos_error", { err: spErr.message });
        if (stagePos && stagePos.length) {
          const funnelIds = Array.from(new Set(stagePos.map((s: any) => s.funnel_id).filter(Boolean)));
          const stageIds = Array.from(new Set(stagePos.map((s: any) => s.stage_id).filter(Boolean)));

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

          const stagesStr = stagePos
            .map((s: any) => `${funnelMap.get(s.funnel_id) || "?"} → ${stageMap.get(s.stage_id) || "?"}`)
            .join(" | ");
          leadCtx += `\nFunis/Etapas: ${stagesStr}`;
        }
      } catch (e) {
        log("stage_throw", { err: String(e) });
      }

      // ===== LTV / purchases (independent) =====
      try {
        if (lead.email || phoneVariants.length) {
          let customerQuery = admin
            .from("unified_customers")
            .select("id, lifetime_value, total_purchases")
            .eq("organization_id", orgId);
          if (lead.email) {
            customerQuery = customerQuery.eq("primary_email", String(lead.email).toLowerCase());
          } else {
            customerQuery = customerQuery.in("primary_phone", phoneVariants);
          }
          const { data: customers, error: custErr } = await customerQuery.limit(1);
          if (custErr) log("customer_error", { err: custErr.message });
          const customer = customers?.[0];
          if (customer) {
            leadCtx += `\nLTV: R$ ${Number(customer.lifetime_value || 0).toFixed(2)} (${customer.total_purchases || 0} compras)`;
            try {
              const { data: purchases } = await admin
                .from("customer_purchases")
                .select("product_name, gross_amount, status, purchased_at")
                .eq("unified_customer_id", customer.id)
                .order("purchased_at", { ascending: false })
                .limit(5);
              if (purchases && purchases.length) {
                leadCtx += `\nÚltimas compras: ${purchases
                  .map((p: any) => `${p.product_name} (R$ ${p.gross_amount} — ${p.status})`)
                  .join("; ")}`;
              }
            } catch (e) {
              log("purchases_throw", { err: String(e) });
            }
          }
        }
      } catch (e) {
        log("ltv_throw", { err: String(e) });
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

    const systemPrompt = buildSystemPrompt(body.action, script, leadCtx);
    const userPrompt = buildUserPrompt(body.action, messages, body.custom_question);

    const model = body.action === "analyze" ? "google/gemini-2.5-pro" : "google/gemini-3-flash-preview";

    log("ai_call", { model, msg_count: messages.length, has_lead: !!lead, has_script: !!script });

    let aiResp: Response;
    try {
      aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          stream: true,
        }),
      });
    } catch (e) {
      log("ai_fetch_throw", { err: String(e) });
      return jsonError(502, "Falha ao contatar gateway de IA");
    }

    if (!aiResp.ok) {
      if (aiResp.status === 429) return jsonError(429, "Limite de uso atingido. Aguarde alguns instantes e tente novamente.");
      if (aiResp.status === 402) return jsonError(402, "Créditos de IA esgotados. Adicione créditos em Configurações > Workspace > Uso.");
      let errText = "";
      try { errText = await aiResp.text(); } catch {}
      log("ai_gateway_error", { status: aiResp.status, body: errText.slice(0, 500) });
      return jsonError(502, "Erro no gateway de IA");
    }

    return new Response(aiResp.body, {
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
