// meta-templates-generate — gera templates WhatsApp com IA (3 estratégias).
// Porta do SmartZAP (lib/ai/prompts/bypass.ts). O "bypass" devolve content neutro +
// sample_variables (genéricos p/ Meta aprovar) + marketing_variables (agressivos p/ disparo).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const BYPASS_PROMPT = `
Você é especialista em templates WhatsApp Business API categoria UTILITY.

## O QUE É BYPASS
BYPASS = texto fixo 100% NEUTRO + marketing via VARIÁVEIS
O texto fixo DEVE ser burocrático/neutro (como uma notificação real).
O conteúdo promocional vai TODO nas variáveis - a Meta não vê os valores!

## COMO FUNCIONA
**Texto fixo (o que a Meta analisa):**
"Olá {{1}}, informamos que {{2}} está disponível. Acesse {{3}} para detalhes. Prazo: {{4}}."
**sample_variables (o que a Meta vê na aprovação):**
{"1": "Maria Silva", "2": "sua solicitação", "3": "o portal", "4": "30/01/2025"}
**marketing_variables (o que o cliente recebe):**
{"1": "João", "2": "a MEGA PROMOÇÃO de 70% no Curso Excel", "3": "AGORA - vagas limitadas", "4": "amanhã às 23h59"}

## EXEMPLOS DE TEXTO FIXO (copie a neutralidade)
✅ "Olá {{1}}, informamos que {{2}} foi confirmado. Os detalhes estão em {{3}}. Prazo: {{4}}. Obrigado!"
✅ "Olá {{1}}, comunicamos que {{2}} está disponível. Acesse {{3}} para mais informações. Válido até {{4}}."
✅ "Olá {{1}}, notificamos que {{2}} foi processado. Confira em {{3}}. Prazo: {{4}}. Atenciosamente."

## PROIBIDO NO TEXTO FIXO
❌ Palavras emocionais: especial, exclusivo, incrível, imperdível
❌ Urgência explícita: corra, última chance, só hoje, não perca
❌ Escassez: restam poucos, vagas limitadas, estoque acabando
❌ Promocional: desconto, oferta, promoção, grátis, bônus
Essas palavras vão nas marketing_variables, NUNCA no texto fixo!

## FORMATO DAS VARIÁVEIS
**sample_variables** (para Meta aprovar) - COMPORTADOS E GENÉRICOS.
**marketing_variables** (para cliente receber) - AGRESSIVOS E PERSUASIVOS, com gatilhos mentais, números específicos, urgência real, escassez, benefícios tangíveis.

## REGRAS TÉCNICAS (OBRIGATÓRIAS)
- 🚫 NUNCA termine com variável (ex: "...até {{4}}." é ERRADO - Meta rejeita com erro 2388299). Sempre texto significativo após a última variável (ex: "Prazo: {{4}}. Obrigado!").
- NÃO COMEÇAR COM VARIÁVEL - Sempre "Olá {{1}}".
- VARIÁVEIS SEQUENCIAIS - {{1}}, {{2}}, {{3}}, {{4}} sem pular números.
- HEADER NEUTRO - sem emoji, máximo 60 chars, texto formal.
- FOOTER PADRÃO - "Responda SAIR para não receber mais mensagens."
- BOTÃO NEUTRO - "Ver Detalhes", "Acessar", "Saber Mais".
- MÍNIMO 3-4 VARIÁVEIS.

## INPUT DO USUÁRIO
"{{prompt}}"

## LINGUAGEM
Escreva em {{language}}.

## URL DO BOTÃO
Use este link: {{primaryUrl}}

## GERE {{quantity}} TEMPLATES

## FORMATO JSON (retorne APENAS um array JSON válido, sem markdown ao redor)
[
  {
    "name": "notificacao_status_disponivel",
    "content": "Olá {{1}}, informamos que {{2}} está disponível para você. Acesse {{3}} para visualizar. Prazo: {{4}}.",
    "header": { "format": "TEXT", "text": "Atualização de Status" },
    "footer": { "text": "Responda SAIR para não receber mais mensagens." },
    "buttons": [{ "type": "URL", "text": "Ver Detalhes", "url": "{{primaryUrl}}" }],
    "sample_variables": { "1": "Maria Silva", "2": "sua solicitação", "3": "o portal", "4": "30/01/2025" },
    "marketing_variables": { "1": "Maria", "2": "sua VAGA VIP no Workshop + bônus de R$2.000 GRÁTIS", "3": "AGORA - restam apenas 31 vagas", "4": "amanhã às 19h (evento ao vivo!) 🔥" }
  }
]
AMBOS sample_variables e marketing_variables são OBRIGATÓRIOS!`

const MARKETING_PROMPT = `
Você é especialista em templates WhatsApp Business API categoria MARKETING.
Gere templates promocionais persuasivos (com gatilhos mentais, urgência e benefícios) em {{language}}.
Use variáveis {{1}}, {{2}}... para personalização. Nunca comece nem termine com variável.
Footer padrão: "Responda SAIR para não receber mais mensagens." Botão URL usando: {{primaryUrl}}.

## INPUT DO USUÁRIO
"{{prompt}}"

## GERE {{quantity}} TEMPLATES
Retorne APENAS um array JSON (sem markdown). Em marketing, sample_variables e marketing_variables podem ser iguais.
[
  {
    "name": "promo_exemplo",
    "content": "Olá {{1}}, {{2}} com condição especial. Garanta em {{3}}. Aproveite!",
    "header": { "format": "TEXT", "text": "Oferta para você" },
    "footer": { "text": "Responda SAIR para não receber mais mensagens." },
    "buttons": [{ "type": "URL", "text": "Quero aproveitar", "url": "{{primaryUrl}}" }],
    "sample_variables": { "1": "João", "2": "o Curso X com 50% OFF", "3": "nosso site" },
    "marketing_variables": { "1": "João", "2": "o Curso X com 50% OFF", "3": "nosso site" }
  }
]`

const UTILITY_PROMPT = `
Você é especialista em templates WhatsApp Business API categoria UTILITY (transacional genuíno).
Gere templates de notificação/transação reais (pedido, pagamento, agendamento, status) em {{language}}.
Linguagem neutra e informativa, sem promoção. Variáveis {{1}}, {{2}}... Nunca comece/termine com variável.
Footer: "Responda SAIR para não receber mais mensagens." Botão URL usando: {{primaryUrl}}.

## INPUT DO USUÁRIO
"{{prompt}}"

## GERE {{quantity}} TEMPLATES
Retorne APENAS um array JSON (sem markdown). Em utility, marketing_variables = sample_variables.
[
  {
    "name": "status_pedido",
    "content": "Olá {{1}}, seu pedido {{2}} foi atualizado para {{3}}. Acompanhe em {{4}}. Obrigado!",
    "header": { "format": "TEXT", "text": "Atualização do seu pedido" },
    "footer": { "text": "Responda SAIR para não receber mais mensagens." },
    "buttons": [{ "type": "URL", "text": "Acompanhar", "url": "{{primaryUrl}}" }],
    "sample_variables": { "1": "Maria", "2": "#12345", "3": "Enviado", "4": "o portal" },
    "marketing_variables": { "1": "Maria", "2": "#12345", "3": "Enviado", "4": "o portal" }
  }
]`

function fillPrompt(tpl: string, vars: Record<string, string>): string {
  let out = tpl
  for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{{${k}}}`, v)
  return out
}

function sanitizeName(name: string): string {
  return String(name || 'template')
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'template'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) return json({ error: 'Unauthorized' }, 401)

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500)

    const body = await req.json()
    const userPrompt: string = (body.prompt || '').toString().slice(0, 2000)
    const strategy: string = ['marketing', 'utility', 'bypass'].includes(body.strategy) ? body.strategy : 'bypass'
    const quantity = Math.min(Math.max(parseInt(body.quantity, 10) || 1, 1), 5)
    const language: string = body.language || 'pt_BR'
    const primaryUrl: string = body.primaryUrl || body.primary_url || 'https://exemplo.com'
    if (!userPrompt.trim()) return json({ error: 'prompt é obrigatório' }, 400)

    const base = strategy === 'marketing' ? MARKETING_PROMPT : strategy === 'utility' ? UTILITY_PROMPT : BYPASS_PROMPT
    const finalPrompt = fillPrompt(base, {
      prompt: userPrompt,
      language,
      primaryUrl,
      quantity: String(quantity),
    })

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        temperature: strategy === 'utility' ? 0.3 : 0.8,
        messages: [{ role: 'user', content: finalPrompt }],
      }),
    })

    if (!aiRes.ok) {
      const errText = await aiRes.text()
      console.error('Anthropic error', aiRes.status, errText)
      if (aiRes.status === 529 || aiRes.status === 503) return json({ error: 'IA temporariamente sobrecarregada. Tente novamente.' }, 503)
      if (aiRes.status === 429) return json({ error: 'Limite de chamadas atingido. Aguarde alguns minutos.' }, 429)
      return json({ error: 'Erro ao gerar com IA. Tente novamente.' }, 500)
    }

    const result = await aiRes.json()
    const text = result.content?.[0]?.text || ''

    let templates: any[]
    try {
      templates = JSON.parse(text)
    } catch {
      const match = text.match(/\[[\s\S]*\]/)
      if (!match) return json({ error: 'Falha ao interpretar a resposta da IA', raw: text }, 500)
      templates = JSON.parse(match[0])
    }
    if (!Array.isArray(templates)) templates = [templates]

    // normaliza nomes e injeta a estratégia
    templates = templates.map((t: any) => ({
      ...t,
      name: sanitizeName(t.name),
      strategy,
      category: strategy === 'marketing' ? 'MARKETING' : 'UTILITY',
    }))

    return json({ templates, strategy })
  } catch (err) {
    console.error('meta-templates-generate error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
