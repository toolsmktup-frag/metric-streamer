-- Create table for chat message history
CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read/insert/delete
CREATE POLICY "Authenticated read" ON public.chat_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert" ON public.chat_messages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated delete" ON public.chat_messages FOR DELETE TO authenticated USING (true);