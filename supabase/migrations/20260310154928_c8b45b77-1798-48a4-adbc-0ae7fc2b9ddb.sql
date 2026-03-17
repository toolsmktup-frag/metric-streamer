
CREATE TABLE public.ad_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id text NOT NULL UNIQUE,
  hook text,
  angle text,
  format text,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_creatives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read" ON public.ad_creatives FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert" ON public.ad_creatives FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update" ON public.ad_creatives FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
