-- Conversations (1:1)
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant1_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  participant2_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_message_text text,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversations_distinct CHECK (participant1_id <> participant2_id)
);
CREATE UNIQUE INDEX conversations_pair_idx ON public.conversations (
  LEAST(participant1_id::text, participant2_id::text),
  GREATEST(participant1_id::text, participant2_id::text)
);
CREATE INDEX conversations_p1_idx ON public.conversations (participant1_id, last_message_at DESC);
CREATE INDEX conversations_p2_idx ON public.conversations (participant2_id, last_message_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view conversations" ON public.conversations
  FOR SELECT TO authenticated
  USING (auth.uid() = participant1_id OR auth.uid() = participant2_id);
CREATE POLICY "Users can create conversations they are in" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = participant1_id OR auth.uid() = participant2_id);
CREATE POLICY "Participants can update conversations" ON public.conversations
  FOR UPDATE TO authenticated
  USING (auth.uid() = participant1_id OR auth.uid() = participant2_id)
  WITH CHECK (auth.uid() = participant1_id OR auth.uid() = participant2_id);

CREATE OR REPLACE FUNCTION public.is_conversation_member(_conversation_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = _conversation_id
      AND (c.participant1_id = _user_id OR c.participant2_id = _user_id)
  )
$$;

-- Extend messages to support the conversation model
ALTER TABLE public.messages ALTER COLUMN chat_id DROP NOT NULL;
ALTER TABLE public.messages
  ADD COLUMN conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  ADD COLUMN receiver_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN message_type text NOT NULL DEFAULT 'text',
  ADD COLUMN content text,
  ADD COLUMN media_url text,
  ADD COLUMN media_duration numeric,
  ADD COLUMN media_name text,
  ADD COLUMN is_read boolean NOT NULL DEFAULT false;
ALTER TABLE public.messages ADD CONSTRAINT messages_parent_check
  CHECK (chat_id IS NOT NULL OR conversation_id IS NOT NULL);
CREATE INDEX messages_conversation_idx ON public.messages (conversation_id, created_at);

CREATE POLICY "Participants can read conversation messages" ON public.messages
  FOR SELECT TO authenticated
  USING (conversation_id IS NOT NULL AND public.is_conversation_member(conversation_id, auth.uid()));
CREATE POLICY "Participants can send conversation messages" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id AND conversation_id IS NOT NULL AND public.is_conversation_member(conversation_id, auth.uid()));
CREATE POLICY "Participants can mark conversation messages read" ON public.messages
  FOR UPDATE TO authenticated
  USING (conversation_id IS NOT NULL AND public.is_conversation_member(conversation_id, auth.uid()))
  WITH CHECK (conversation_id IS NOT NULL AND public.is_conversation_member(conversation_id, auth.uid()));

-- Presence
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen timestamptz;

-- Call events
CREATE TABLE public.call_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  caller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'video',
  status text NOT NULL DEFAULT 'ringing',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX call_events_receiver_idx ON public.call_events (receiver_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.call_events TO authenticated;
GRANT ALL ON public.call_events TO service_role;
ALTER TABLE public.call_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Call parties can view events" ON public.call_events
  FOR SELECT TO authenticated USING (auth.uid() = caller_id OR auth.uid() = receiver_id);
CREATE POLICY "Callers can start calls" ON public.call_events
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = caller_id AND public.is_conversation_member(conversation_id, auth.uid()));
CREATE POLICY "Call parties can update events" ON public.call_events
  FOR UPDATE TO authenticated
  USING (auth.uid() = caller_id OR auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = caller_id OR auth.uid() = receiver_id);

CREATE TRIGGER call_events_updated_at BEFORE UPDATE ON public.call_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Job applications can point at a conversation
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL;

-- Realtime
ALTER TABLE public.conversations REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.call_events REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_events;
