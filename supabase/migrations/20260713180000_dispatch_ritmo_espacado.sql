-- ─────────────────────────────────────────────────────────────────
-- Ritmo espaçado do disparo de rastreio (pedido do Matheus 13/07):
-- 1 mensagem a cada N minutos (aquecimento do número novo), do mais
-- recente para o mais antigo, e só dentro de uma janela de horário.
--
--  • send_gap_minutes  — 0 = modo lote (batch_size por minuto, como
--    antes); >0 = 1 mensagem a cada N min (função pula a execução se
--    o último envio foi há menos de N min).
--  • queue_order       — ordem da fila: oldest_first | newest_first.
--  • send_window_start/end — hora BRT; envia só se start <= hora < end.
--    (start = end desativa a janela.)
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE public.tracking_dispatch_settings
  ADD COLUMN IF NOT EXISTS send_gap_minutes  int  NOT NULL DEFAULT 0 CHECK (send_gap_minutes BETWEEN 0 AND 240),
  ADD COLUMN IF NOT EXISTS queue_order       text NOT NULL DEFAULT 'oldest_first' CHECK (queue_order IN ('oldest_first','newest_first')),
  ADD COLUMN IF NOT EXISTS send_window_start int  NOT NULL DEFAULT 0 CHECK (send_window_start BETWEEN 0 AND 23),
  ADD COLUMN IF NOT EXISTS send_window_end   int  NOT NULL DEFAULT 0 CHECK (send_window_end BETWEEN 0 AND 23);

-- Config combinada: 1 msg a cada 8 min, mais recentes primeiro, 8h–21h.
UPDATE public.tracking_dispatch_settings
SET send_gap_minutes = 8,
    queue_order = 'newest_first',
    send_window_start = 8,
    send_window_end = 21
WHERE id = 1;
