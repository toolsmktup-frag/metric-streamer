

## Fase 2: Persistir Eventos na Tabela `clicks`

### Escopo (3 entregas)

**Entrega 1: SQL para rodar no Supabase Dashboard**

Criar tabela `clicks` com todos os campos do payload atual:

```sql
CREATE TABLE public.clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id uuid NOT NULL,
  event_type text NOT NULL DEFAULT 'pageview',
  funnel_id text,
  stage_id text,
  page_url text,
  page_title text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  fbclid text,
  fbc text,
  fbp text,
  gclid text,
  ip_address text,
  user_agent text,
  screen_resolution text,
  timezone text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_clicks_visitor_id ON public.clicks(visitor_id);
CREATE INDEX idx_clicks_email ON public.clicks(email) WHERE email IS NOT NULL;
CREATE INDEX idx_clicks_created_at ON public.clicks(created_at);
CREATE INDEX idx_clicks_funnel_id ON public.clicks(funnel_id) WHERE funnel_id IS NOT NULL;

ALTER TABLE public.clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON public.clicks
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

**Entrega 2: Atualizar `supabase/functions/track-event/index.ts`**
- Substituir o `console.log` por um `INSERT` na tabela `clicks` usando `createClient` com `service_role`
- Manter log como fallback se o insert falhar
- O `import` do Supabase client já existe no arquivo

**Entrega 3: Captura de email no `public/tracking/tracker.js`**
- Adicionar listener `blur` em `input[type=email]` e `input[name*=email]`
- Ao detectar email válido, enviar evento `email_capture` com campo `email` no payload
- Retrocompatível — não quebra nada se não houver campo de email na página

### O que NÃO muda
- Nenhuma página do dashboard é alterada
- Nenhum webhook existente é tocado
- Nenhuma tabela existente é modificada
- `v_all_sales` permanece igual

### Resultado
- Cada pageview e email capturado fica salvo na tabela `clicks`
- Jornada completa do visitante pode ser reconstruída por `visitor_id`
- Base pronta para Fase 3 (Meta CAPI — cruzar vendas com cliques)

### Para o usuário
Vou gerar o SQL completo para copiar/colar no Supabase Dashboard, atualizar a Edge Function (que também precisa de re-deploy manual), e atualizar o `tracker.js`.

