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
      const who = m.direction === "outbound" ? "Vendedor" : "Cliente";
      const time = new Date(m.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
      const body = (m.body || `[${m.message_type}]`).slice(0, 500);
      return `[${time}] ${who}: ${body}`;
    })
    .join("\n");

  let user = `== HISTÓRICO DA CONVERSA (últimas ${messages.length} mensagens) ==\n${transcript || "(sem mensagens)"}`;
  if (customQuestion) {
    user += `\n\n== PERGUNTA / OBJEÇÃO DO VENDEDOR ==\n${customQuestion}`;
  }
  return user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as RequestBody;
    if (!body || !body.action || !body.phone) {
      return new Response(JSON.stringify({ error: "Parâmetros inválidos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth client (uses caller's JWT) — to identify the org
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service-role client — bypasses RLS to read messages and lead context
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: profile } = await admin
      .from("user_profiles")
      .select("organization_id")
      .eq("id", userData.user.id)
      .maybeSingle();
    const orgId = profile?.organization_id;
    if (!orgId) {
      return new Response(JSON.stringify({ error: "Usuário sem organização" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch last 30 messages for the conversation
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
    const { data: rawMessages } = await msgQuery;
    const messages = (rawMessages || []).reverse();

    // Lead context: try to find lead by phone variants and gather funnel/stage/tags + LTV
    let leadCtx = `Telefone: ${body.phone}`;
    const phoneDigits = body.phone.replace(/\D/g, "");
    const phoneVariants = Array.from(
      new Set([
        phoneDigits,
        phoneDigits.startsWith("55") ? phoneDigits : `55${phoneDigits}`,
        phoneDigits.startsWith("55") ? phoneDigits.slice(2) : phoneDigits,
      ]),
    );

    const { data: leads } = await admin
      .from("leads")
      .select("id, name, email, phone, tags")
      .eq("organization_id", orgId)
      .in("phone", phoneVariants)
      .limit(1);
    const lead = leads?.[0];

    if (lead) {
      leadCtx = `Nome: ${lead.name || "(sem nome)"}\nTelefone: ${lead.phone}\nEmail: ${lead.email || "(sem email)"}\nTags: ${Array.isArray(lead.tags) && lead.tags.length ? lead.tags.join(", ") : "(nenhuma)"}`;

      // Current funnel stage (most recent)
      const { data: stagePos } = await admin
        .from("lead_stage_positions")
        .select("funnel_id, stage_id, lead_funnels(name), lead_funnel_stages(name)")
        .eq("lead_id", lead.id)
        .limit(3);
      if (stagePos && stagePos.length) {
        const stagesStr = stagePos
          .map((s: any) => `${s.lead_funnels?.name || "?"} → ${s.lead_funnel_stages?.name || "?"}`)
          .join(" | ");
        leadCtx += `\nFunis/Etapas: ${stagesStr}`;
      }

      // LTV via unified_customers
      if (lead.email || lead.phone) {
        let customerQuery = admin
          .from("unified_customers")
          .select("id, lifetime_value, total_purchases")
          .eq("organization_id", orgId);
        if (lead.email) {
          customerQuery = customerQuery.eq("primary_email", lead.email.toLowerCase());
        } else {
          customerQuery = customerQuery.in("primary_phone", phoneVariants);
        }
        const { data: customers } = await customerQuery.limit(1);
        const customer = customers?.[0];
        if (customer) {
          leadCtx += `\nLTV: R$ ${Number(customer.lifetime_value || 0).toFixed(2)} (${customer.total_purchases || 0} compras)`;
          const { data: purchases } = await admin
            .from("customer_purchases")
            .select("product_name, gross_amount, status, purchased_at")
            .eq("unified_customer_id", customer.id)
            .order("purchased_at", { ascending: false })
            .limit(5);
          if (purchases && purchases.length) {
            leadCtx += `\nÚltimas compras: ${purchases.map((p: any) => `${p.product_name} (R$ ${p.gross_amount} — ${p.status})`).join("; ")}`;
          }
        }
      }
    }

    // Load active script
    const { data: scripts } = await admin
      .from("sales_copilot_scripts")
      .select("content")
      .eq("organization_id", orgId)
      .eq("is_default", true)
      .limit(1);
    const script = scripts?.[0]?.content || "";

    const systemPrompt = buildSystemPrompt(body.action, script, leadCtx);
    const userPrompt = buildUserPrompt(body.action, messages, body.custom_question);

    const model = body.action === "analyze" ? "google/gemini-2.5-pro" : "google/gemini-3-flash-preview";

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de uso atingido. Aguarde alguns instantes e tente novamente." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiResp.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos em Configurações > Workspace > Uso." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const errText = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, errText);
      return new Response(JSON.stringify({ error: "Erro no gateway de IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(aiResp.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("sales-copilot error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
