
CREATE TABLE public.daily_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_date date NOT NULL DEFAULT CURRENT_DATE,
  successes text,
  bottlenecks text,
  alerts text,
  suggestions text,
  raw_response text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(analysis_date)
);

ALTER TABLE public.daily_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read" ON public.daily_analyses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert" ON public.daily_analyses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update" ON public.daily_analyses FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
