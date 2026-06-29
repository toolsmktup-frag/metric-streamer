// ═══════════════════════════════════════════════════════════════════
// classify-sales — motor de classificação automática de produtos
//
// Detecta produtos que venderam mas não estão em funnel_products
// (v_unmapped_products), pede à IA (Claude) o {funil, role} por
// similaridade com os produtos já mapeados, grava em
// product_funnel_suggestions e — se confiança ALTA — auto-aplica em
// funnel_products (source='ai_auto', reversível). Roda via cron diário.
//
// Body opcional: { "auto_apply": true|false }  (default: true, só p/ high)
// ═══════════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALID_ROLES = ['front', 'order_bump', 'upsell1', 'upsell2', 'upsell3', 'downsell', 'other'];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function extractJson(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const arr = text.match(/\[[\s\S]*\]/);
  return arr ? arr[0] : '[]';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_KEY) return json({ error: 'ANTHROPIC_API_KEY ausente' }, 500);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json().catch(() => ({}));
    const autoApply = body.auto_apply !== false; // default true (só high)

    // 1) Gaps: produtos vendidos sem classificação
    const { data: gaps, error: gapsErr } = await supabase
      .from('v_unmapped_products').select('*');
    if (gapsErr) throw gapsErr;
    if (!gaps?.length) return json({ message: 'Nada a classificar', gaps: 0 });

    // 2) Pular os que já têm sugestão registrada
    const { data: existing } = await supabase
      .from('product_funnel_suggestions').select('platform, product_id');
    const seen = new Set((existing || []).map((s: any) => `${s.platform}:${s.product_id}`));
    const todo = gaps.filter((g: any) => !seen.has(`${g.platform}:${g.product_id}`));
    if (!todo.length) return json({ message: 'Todos os gaps já têm sugestão', gaps: gaps.length });

    // 3) Contexto: funis + produtos já mapeados (p/ a IA casar por similaridade)
    const { data: funnels } = await supabase.from('funnels').select('id, name, is_active');
    const { data: fps } = await supabase
      .from('funnel_products').select('funnel_id, role, product_name_contains, display_name');

    const context = (funnels || []).map((f: any) => {
      const prods = (fps || [])
        .filter((p: any) => p.funnel_id === f.id)
        .map((p: any) => `${p.role}=${p.display_name || p.product_name_contains}`)
        .join('; ');
      return `- "${f.name}" (id=${f.id}${f.is_active ? '' : ', INATIVO'}): ${prods || '(sem produtos)'}`;
    }).join('\n');

    const toClassify = todo.map((g: any) =>
      `{ "product_id": "${g.product_id}", "platform": "${g.platform}", "product_name": ${JSON.stringify(g.product_name)}, "ofertas": ${JSON.stringify(g.offers || [])} }`
    ).join(',\n');

    const prompt = `Você classifica produtos de e-commerce na posição correta dentro do funil de vendas.

FUNIS EXISTENTES e seus produtos já mapeados (use para casar por SIMILARIDADE DE NOME):
${context}

ROLES possíveis: front (oferta principal), order_bump (item adicional barato no checkout), upsell1/upsell2/upsell3 (ofertas pós-compra), downsell, other (não pertence a nenhum funil conhecido).

SINAL FORTE — o nome da OFERTA (campo "ofertas") quase sempre revela a POSIÇÃO. Use como prioridade quando presente:
- contém "upsell" ou "oferta 197" ou "para upsell" → upsell1 (ou upsell2/3 se indicar "upsell 2"/"upsell 3")
- contém "downsell" → downsell
- contém "order bump" ou "bump" → order_bump
- contém "principal" ou "checkout principal" → front
O FUNIL (a qual produto pertence) vem da semelhança do NOME com os produtos já mapeados; a POSIÇÃO/role vem preferencialmente da oferta.

Para cada PRODUTO abaixo, decida a qual funil ele pertence (pelo nome) e qual o role (pela oferta, senão pelo nome). Ex.: "RevitaSoul - 6 potes" pertence ao funil RevitaSoul; oferta "principal" → front. "Pote Extra (Bump...)" → order_bump. Se o nome não casar com nenhum funil, use funnel_id=null e role="other".

PRODUTOS A CLASSIFICAR:
[
${toClassify}
]

Responda APENAS com um array JSON, um objeto por produto, neste formato exato:
[{ "product_id": "...", "platform": "...", "funnel_id": "uuid-ou-null", "funnel_name": "...", "role": "front|order_bump|upsell1|upsell2|upsell3|downsell|other", "confidence": "high|medium|low", "reasoning": "curto" }]
- confidence "high" SÓ quando o nome casa claramente com um funil existente.
- Não invente funnel_id; use exatamente os ids listados ou null.`;

    const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!aiResp.ok) return json({ error: `IA falhou: ${aiResp.status} ${await aiResp.text()}` }, 502);
    const aiData = await aiResp.json();
    const text = aiData.content?.[0]?.text || '[]';

    let suggestions: any[];
    try {
      suggestions = JSON.parse(extractJson(text));
    } catch {
      return json({ error: 'IA retornou JSON inválido', raw: text.slice(0, 500) }, 502);
    }

    const validFunnelIds = new Set((funnels || []).map((f: any) => f.id));

    // 4) Gravar sugestões + auto-aplicar as de alta confiança
    let applied = 0;
    const results: any[] = [];
    for (const s of suggestions) {
      const gap = todo.find((g: any) =>
        String(g.product_id) === String(s.product_id) && g.platform === s.platform);
      if (!gap) continue;

      const role = VALID_ROLES.includes(s.role) ? s.role : 'other';
      const funnelOk = s.funnel_id && validFunnelIds.has(s.funnel_id);
      const willApply = autoApply && s.confidence === 'high' && funnelOk && role !== 'other';

      await supabase.from('product_funnel_suggestions').upsert({
        platform: gap.platform,
        product_id: gap.product_id,
        product_name: gap.product_name,
        sales_count: gap.sales_count,
        revenue: gap.revenue,
        suggested_funnel_id: funnelOk ? s.funnel_id : null,
        suggested_funnel_name: s.funnel_name || null,
        suggested_role: role,
        confidence: s.confidence || 'low',
        reasoning: s.reasoning || null,
        status: willApply ? 'applied' : 'pending',
        decided_at: willApply ? new Date().toISOString() : null,
      }, { onConflict: 'platform,product_id' });

      if (willApply) {
        await supabase.from('funnel_products').insert({
          funnel_id: s.funnel_id,
          product_id: gap.product_id,
          platform: gap.platform,
          role,
          product_name_contains: gap.product_name,
          display_name: gap.product_name,
          source: 'ai_auto',
          ai_confidence: s.confidence,
        });
        applied++;
      }
      results.push({ product: gap.product_name, funnel: s.funnel_name, role, confidence: s.confidence, applied: willApply });
    }

    return json({ gaps: gaps.length, processed: todo.length, applied, results });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
