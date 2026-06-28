# Deploy — WhatsApp API Oficial + Funil de Webinário

Branch: `feat/whatsapp-oficial-meta` (commit `9efe585`).
Status: **código pronto e commitado**, `tsc -b` OK. Falta publicar e configurar (abaixo).

> ⚠️ A branch foi criada sobre `publish/rastreios` (rastreios ainda **não** está na `main`).
> Decidir com o Matheus a ordem de merge (mergear rastreios primeiro e rebasear esta, ou PR conjunta).

---

## O que falta pra ir pra produção (checklist)

### 1. Subir o código (precisa do PAT do Matheus)
A auth desta máquina não acessa o repo privado. Com o PAT do Matheus:
```bash
git push -u origin feat/whatsapp-oficial-meta
gh pr create --base main --head feat/whatsapp-oficial-meta \
  --title "WhatsApp API Oficial + Funil de Webinário" --body "ver docs/DEPLOY-whatsapp-oficial.md"
```
O Lovable rebuilda o **front** a partir do merge na branch conectada.

### 2. Aplicar as 2 migrations no Supabase  ⟵ FAZER ANTES do front ir pro ar
`supabase/migrations/20260626120000_whatsapp_official_channel.sql` e `..._120100_whatsapp_templates.sql`.
Opção A (CLI): `supabase link --project-ref emfbocpmphtftqcezaib && supabase db push`
Opção B (garantida): colar o conteúdo dos 2 arquivos no **SQL Editor** do Supabase e rodar.
São aditivas e idempotentes (add column / create table) — não quebram nada existente.

### 3. Deploy das 7 edge functions
```bash
for fn in meta-whatsapp-instance meta-whatsapp-webhook meta-whatsapp-send \
          meta-templates-sync meta-templates-create meta-templates-generate webinar-redirect; do
  supabase functions deploy $fn --project-ref emfbocpmphtftqcezaib
done
```
(O `wz-executor` também foi alterado — redeploy: `supabase functions deploy wz-executor`.)
Todas já estão registradas em `supabase/config.toml` com `verify_jwt = false`.

### 4. Secrets no Supabase (Project Settings → Edge Functions → Secrets)
- `ANTHROPIC_API_KEY` — **já existe** (usado pela `ai-agent`); reaproveitado pelo gerador de templates.
- `WEBINAR_LINK_SECRET` — *opcional*; se ausente, usa a service-role key. (recomendado setar um valor próprio)
- `META_GRAPH_VERSION` — *opcional*; default `v22.0`.

### 5. Conectar a conta WABA (na tela)
`/whatsapp-oficial` → aba **Instâncias** → preencher:
- WABA ID: `446877578513851`
- Phone Number ID (número 9667-1824): `455137097688325`
- Access Token (24h pra teste, ou System User permanente) — colar **só na tela**, nunca no código.
- App Secret: opcional (valida o webhook).

### 6. Webhook da Meta (painel do app → WhatsApp → Configuration)
A tela de conexão mostra a **Callback URL** (`.../functions/v1/meta-whatsapp-webhook`) e o **Verify Token**.
> No lançamento, dá pra **pular** o webhook (só envio). Cuidado: o número 9667-1824 é o do ManyChat — apontar o webhook pode desviar eventos dele. Pra teste, usar número de teste ou não configurar webhook.

### 7. Templates (aba Templates → Gerar com IA → bypass)
- `webinario_convite` (com `{{link_webinario}}` numa variável)
- `webinario_checkout`
Submeter à Meta e aguardar `APPROVED`. Eles aparecem **também no ManyChat** (mesma WABA).

### 8. (Opcional) Regenerar tipos do Supabase
Remove os `(supabase as any)` dos hooks novos:
`supabase gen types typescript --project-ref emfbocpmphtftqcezaib > src/integrations/supabase/types.ts`

---

## Funil de Webinário (depois do acima)
`/whatsapp-oficial` → aba **Webinário** → escolher instância + os 2 templates + links + nº de follow-ups (7) + horário → **Criar Funil de Webinário**.
Revisar/ativar os 2 fluxos gerados e fazer **Bulk Enroll** dos leads do Articulabem no fluxo "Não assistiu".

## Pendência de produto
- Definir a fonte do sinal "assistiu": link rastreável (já funciona) vs webhook da plataforma de webinário (6 perguntas a levar pra plataforma — ver plano).
