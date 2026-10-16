CREATE TABLE public.tutor_chat_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'user',
  content text NOT NULL,
  web_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.tutor_chat_messages TO authenticated;
GRANT ALL ON public.tutor_chat_messages TO service_role;

ALTER TABLE public.tutor_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students read their own tutor chat"
  ON public.tutor_chat_messages FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Students add to their own tutor chat"
  ON public.tutor_chat_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Students clear their own tutor chat"
  ON public.tutor_chat_messages FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX tutor_chat_messages_user_created_idx
  ON public.tutor_chat_messages (user_id, created_at);