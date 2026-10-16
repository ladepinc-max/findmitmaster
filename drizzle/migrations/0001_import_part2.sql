
CREATE POLICY "Signed-in users can view post media" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'posts');
CREATE POLICY "Users can upload their own post media" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'posts' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can update their own post media" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'posts' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can delete their own post media" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'posts' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can view their own CV" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'cvs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can upload their own CV" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'cvs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can update their own CV" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'cvs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can delete their own CV" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'cvs' AND (storage.foldername(name))[1] = auth.uid()::text);

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

REVOKE EXECUTE ON FUNCTION public.is_conversation_member(uuid, uuid) FROM anon, public;

CREATE POLICY "Signed-in users can view chat media" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'chat-media');
CREATE POLICY "Users can upload their own chat media" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update their own chat media" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete their own chat media" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE TABLE public.job_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Job alert',
  keywords text NOT NULL DEFAULT '',
  skills text[] NOT NULL DEFAULT '{}',
  category text,
  job_type text,
  min_salary numeric,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_alerts TO authenticated;
GRANT ALL ON public.job_alerts TO service_role;
ALTER TABLE public.job_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own alerts select" ON public.job_alerts FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own alerts insert" ON public.job_alerts FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own alerts update" ON public.job_alerts FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own alerts delete" ON public.job_alerts FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER job_alerts_set_updated_at BEFORE UPDATE ON public.job_alerts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.job_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  alert_id uuid REFERENCES public.job_alerts(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX job_notifications_unique ON public.job_notifications (user_id, job_id, alert_id);
CREATE INDEX job_notifications_user_idx ON public.job_notifications (user_id, created_at DESC);
GRANT SELECT, UPDATE, DELETE ON public.job_notifications TO authenticated;
GRANT ALL ON public.job_notifications TO service_role;
ALTER TABLE public.job_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notifications select" ON public.job_notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own notifications update" ON public.job_notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own notifications delete" ON public.job_notifications FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.fanout_job_alerts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  a RECORD;
  hay text;
BEGIN
  hay := lower(coalesce(NEW.title,'') || ' ' || coalesce(NEW.company,'') || ' ' || coalesce(NEW.description,'') || ' ' || coalesce(NEW.category,'') || ' ' || array_to_string(coalesce(NEW.skills,'{}'), ' '));
  FOR a IN
    SELECT * FROM public.job_alerts
    WHERE is_active = true AND user_id <> NEW.employer_id
  LOOP
    CONTINUE WHEN a.category IS NOT NULL AND a.category <> '' AND lower(a.category) <> lower(coalesce(NEW.category,''));
    CONTINUE WHEN a.job_type IS NOT NULL AND a.job_type <> '' AND lower(a.job_type) <> lower(coalesce(NEW.job_type,''));
    CONTINUE WHEN a.min_salary IS NOT NULL AND coalesce(NEW.salary_amount, 0) < a.min_salary;
    CONTINUE WHEN a.keywords <> '' AND position(lower(a.keywords) in hay) = 0;
    CONTINUE WHEN array_length(a.skills, 1) IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM unnest(a.skills) s WHERE position(lower(s) in hay) > 0
    );
    INSERT INTO public.job_notifications (user_id, alert_id, job_id, title, body)
    VALUES (a.user_id, a.id, NEW.id, 'New job: ' || NEW.title, NEW.company || ' · ' || NEW.location_name)
    ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE TRIGGER jobs_fanout_alerts AFTER INSERT ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.fanout_job_alerts();
REVOKE ALL ON FUNCTION public.fanout_job_alerts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_counts() FROM PUBLIC, anon, authenticated;
CREATE TABLE public.live_classes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  host_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  topic text NOT NULL,
  description text NOT NULL DEFAULT '',
  thumbnail_path text,
  is_live boolean NOT NULL DEFAULT true,
  viewers_count integer NOT NULL DEFAULT 0,
  room_name text NOT NULL,
  hls_url text,
  practical_price numeric NOT NULL DEFAULT 20,
  practical_currency text NOT NULL DEFAULT 'GHS',
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  ended_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.live_classes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_classes TO authenticated;
GRANT ALL ON public.live_classes TO service_role;

ALTER TABLE public.live_classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Live classes are viewable by everyone"
  ON public.live_classes FOR SELECT
  USING (true);

CREATE POLICY "Hosts can create their own live classes"
  ON public.live_classes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Hosts can update their own live classes"
  ON public.live_classes FOR UPDATE TO authenticated
  USING (auth.uid() = host_id) WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Hosts can delete their own live classes"
  ON public.live_classes FOR DELETE TO authenticated
  USING (auth.uid() = host_id);

CREATE INDEX live_classes_live_idx ON public.live_classes (is_live, started_at DESC);

CREATE TRIGGER set_live_classes_updated_at
  BEFORE UPDATE ON public.live_classes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TABLE IF NOT EXISTS public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  topic text not null default '',
  is_live boolean not null default true,
  viewer_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_sessions TO authenticated;
GRANT SELECT ON public.live_sessions TO anon;
GRANT ALL ON public.live_sessions TO service_role;

ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "live_sessions_select" ON public.live_sessions FOR SELECT USING (true);
CREATE POLICY "live_sessions_insert_own" ON public.live_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = host_id);
CREATE POLICY "live_sessions_update" ON public.live_sessions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "live_sessions_delete_own" ON public.live_sessions FOR DELETE TO authenticated USING (auth.uid() = host_id);

CREATE TABLE IF NOT EXISTS public.live_signals (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  from_id uuid not null references public.profiles(id) on delete cascade,
  to_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('offer','answer','ice')),
  data jsonb not null,
  created_at timestamptz not null default now()
);

GRANT SELECT, INSERT, DELETE ON public.live_signals TO authenticated;
GRANT ALL ON public.live_signals TO service_role;

ALTER TABLE public.live_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "live_signals_select_party" ON public.live_signals FOR SELECT TO authenticated USING (auth.uid() = from_id OR auth.uid() = to_id);
CREATE POLICY "live_signals_insert_self" ON public.live_signals FOR INSERT TO authenticated WITH CHECK (auth.uid() = from_id);
CREATE POLICY "live_signals_delete_party" ON public.live_signals FOR DELETE TO authenticated USING (auth.uid() = from_id OR auth.uid() = to_id);

CREATE INDEX IF NOT EXISTS live_signals_to_idx ON public.live_signals (to_id, created_at DESC);
CREATE INDEX IF NOT EXISTS live_sessions_live_idx ON public.live_sessions (is_live, created_at DESC);

CREATE TRIGGER live_sessions_set_updated_at BEFORE UPDATE ON public.live_sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.live_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_signals;
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
CREATE TABLE public.chat_notifications (
  id uuid primary key default gen_random_uuid(),
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  message_type text not null default 'text',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_notifications TO authenticated;
GRANT ALL ON public.chat_notifications TO service_role;

ALTER TABLE public.chat_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own chat notifications" ON public.chat_notifications
  FOR SELECT TO authenticated USING (auth.uid() = receiver_id OR auth.uid() = sender_id);
CREATE POLICY "send chat notifications" ON public.chat_notifications
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "mark own chat notifications read" ON public.chat_notifications
  FOR UPDATE TO authenticated USING (auth.uid() = receiver_id) WITH CHECK (auth.uid() = receiver_id);
CREATE POLICY "delete own chat notifications" ON public.chat_notifications
  FOR DELETE TO authenticated USING (auth.uid() = receiver_id);

CREATE INDEX chat_notifications_unread_idx ON public.chat_notifications (receiver_id, is_read);
CREATE INDEX chat_notifications_sender_idx ON public.chat_notifications (receiver_id, sender_id);

ALTER TABLE public.chat_notifications REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_notifications;
create index if not exists posts_created_at_idx on public.posts (created_at desc);
create index if not exists posts_status_created_at_idx on public.posts (status, created_at desc);
create index if not exists posts_user_created_at_idx on public.posts (user_id, created_at desc);
create index if not exists messages_conversation_created_at_idx on public.messages (conversation_id, created_at);
create index if not exists conversations_last_message_at_idx on public.conversations (last_message_at desc);
create index if not exists jobs_created_at_idx on public.jobs (created_at desc);
