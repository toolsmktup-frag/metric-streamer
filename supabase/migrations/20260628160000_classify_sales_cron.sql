-- Cron diário do motor de classificação automática (classify-sales).
-- Roda 09:00 UTC (06:00 BRT) — pega as vendas do dia anterior, a IA mapeia
-- produtos novos em funnel_products (auto-aplica só os de alta confiança).
-- O token abaixo é a chave ANON (pública; RLS protege os dados).

select cron.unschedule('classify-sales-daily')
  where exists (select 1 from cron.job where jobname = 'classify-sales-daily');

select cron.schedule(
  'classify-sales-daily',
  '0 9 * * *',
  $$
  select net.http_post(
    url := 'https://emfbocpmphtftqcezaib.supabase.co/functions/v1/classify-sales',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZmJvY3BtcGh0ZnRxY2V6YWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5ODc4ODAsImV4cCI6MjA4ODU2Mzg4MH0.EpE1RwQhmk4C9YFdVjnJXp__cI8LPiic5dMqIMP1g8M'
    ),
    body := '{"auto_apply": true}'::jsonb
  );
  $$
);
