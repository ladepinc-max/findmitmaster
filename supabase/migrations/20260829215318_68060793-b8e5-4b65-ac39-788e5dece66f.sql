CREATE TABLE IF NOT EXISTS public.chat_calls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  caller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'video',
  status TEXT NOT NULL DEFAULT 'ringing',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_calls TO authenticated;
GRANT ALL ON public.chat_calls TO service_role;
ALTER TABLE public.chat_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Call parties can view calls" ON public.chat_calls FOR SELECT TO authenticated USING (auth.uid() = caller_id OR auth.uid() = receiver_id);
CREATE POLICY "Caller can create calls" ON public.chat_calls FOR INSERT TO authenticated WITH CHECK (auth.uid() = caller_id);
CREATE POLICY "Call parties can update calls" ON public.chat_calls FOR UPDATE TO authenticated USING (auth.uid() = caller_id OR auth.uid() = receiver_id) WITH CHECK (auth.uid() = caller_id OR auth.uid() = receiver_id);

CREATE TABLE IF NOT EXISTS public.chat_call_signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  call_id UUID NOT NULL REFERENCES public.chat_calls(id) ON DELETE CASCADE,
  from_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.chat_call_signals TO authenticated;
GRANT ALL ON public.chat_call_signals TO service_role;
ALTER TABLE public.chat_call_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signal parties can view" ON public.chat_call_signals FOR SELECT TO authenticated USING (auth.uid() = from_id OR auth.uid() = to_id);
CREATE POLICY "Users can send signals" ON public.chat_call_signals FOR INSERT TO authenticated WITH CHECK (auth.uid() = from_id);
CREATE INDEX IF NOT EXISTS chat_call_signals_call_idx ON public.chat_call_signals(call_id, to_id);
CREATE INDEX IF NOT EXISTS chat_calls_receiver_idx ON public.chat_calls(receiver_id, status);

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_calls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_call_signals;