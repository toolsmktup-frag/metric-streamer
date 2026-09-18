-- ════════════════════════════════════════════════════════════════════════════
-- 18/09/2026 — Separar o Curso Mestre (47629) do fluxo do Guia (46342).
--
-- Problema: o fluxo "Guia das Tinturas" atendia os dois produtos, mas todas as
-- mensagens tinham "Guia de Preparo de Tinturas" escrito à mão. Quem comprava o
-- Guia e em seguida gerava o Pix do Curso Mestre (order bump da página de
-- obrigado) recebia "vi que você gerou o pedido do Guia e não concluiu" três
-- minutos depois de receber o acesso ao Guia — parecia cobrança em dobro.
--
-- Não dá para usar {{product_name}}: o nome na Ticto é "COMO PREPARAR TINTURAS
-- DE ERVAS MEDICINAIS", que não serve como nome comercial na mensagem.
--
-- JÁ APLICADO EM PRODUÇÃO em 18/09/2026. Backup do fluxo anterior em
-- public.wz_flow_backups (reason = 'antes de separar o upsell 47629 ...').
-- ════════════════════════════════════════════════════════════════════════════

-- 1) O fluxo do Guia deixa de responder pelo 47629.
--    (todos os triggers passaram de ["46342","47629"] para ["46342"])
update public.wz_flows f
set nodes = (
  select jsonb_agg(
    case
      when n->>'type' = 'trigger' and (n->'data'->'productIdFilter') ? '47629'
      then jsonb_set(n, '{data,productIdFilter}',
             coalesce((select jsonb_agg(x) from jsonb_array_elements_text(n->'data'->'productIdFilter') x
                       where x <> '47629'), '[]'::jsonb))
      else n
    end order by ord)
  from jsonb_array_elements(f.nodes) with ordinality as t(n, ord)
), updated_at = now()
where f.id = '9b4474c1-d6b2-4587-978e-be1c61a245b8';

-- 2) Fluxo novo "Curso Mestre das Tinturas — complemento"
--    (id c0f5e1a2-47c6-4e39-9b21-000000047629, 6 nós, 3 ligações, ativo)
--    Trata quem cai nele como COMPRADOR do Guia, não como pendência:
--    "Vi que além do Guia você aproveitou pra levar o Curso Mestre também…
--     Se preferir ficar só com o Guia por enquanto, é só ignorar."

-- 3) Removidas do fluxo do Guia as duas frases que prometiam o Curso Mestre
--    a quem só comprou o Guia:
--      "Se você levou o Curso Mestre das Tinturas junto, ele já está nesse
--       mesmo portal, tá? Qualquer dúvida, é só me chamar aqui!"
--         → "Qualquer dúvida, é só me chamar aqui!"
--      " Se comprou o Curso Mestre das Tinturas também, ele aparece nesse
--       mesmo portal!"  → removida
--    (o Curso agora avisa sozinho quando é aprovado, pelo fluxo próprio)

-- ─── Como reverter tudo ─────────────────────────────────────────────────────
-- update public.wz_flows f
-- set nodes = b.nodes, edges = b.edges, updated_at = now()
-- from public.wz_flow_backups b
-- where b.flow_id = f.id and f.id = '9b4474c1-d6b2-4587-978e-be1c61a245b8'
-- order by b.created_at desc limit 1;
-- update public.wz_flows set is_active = false where id = 'c0f5e1a2-47c6-4e39-9b21-000000047629';
