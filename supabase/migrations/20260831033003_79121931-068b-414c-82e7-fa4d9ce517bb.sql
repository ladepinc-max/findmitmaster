
ALTER TABLE public.live_classes
  ADD COLUMN IF NOT EXISTS current_topic text,
  ADD COLUMN IF NOT EXISTS duration_minutes integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS scheduled_end_at timestamptz,
  ADD COLUMN IF NOT EXISTS recording_path text,
  ADD COLUMN IF NOT EXISTS teacher_share numeric NOT NULL DEFAULT 0.8;

CREATE TABLE IF NOT EXISTS public.class_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.live_classes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'GHS',
  reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, user_id)
);
GRANT SELECT, INSERT ON public.class_enrollments TO authenticated;
GRANT ALL ON public.class_enrollments TO service_role;
ALTER TABLE public.class_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "enrollments readable" ON public.class_enrollments FOR SELECT TO authenticated USING (true);
CREATE POLICY "enroll self" ON public.class_enrollments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.class_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.live_classes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'all' CHECK (channel IN ('all','qa')),
  body text NOT NULL DEFAULT '',
  image_path text,
  upvotes integer NOT NULL DEFAULT 0,
  answered boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.class_messages TO authenticated;
GRANT ALL ON public.class_messages TO service_role;
ALTER TABLE public.class_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "class messages readable" ON public.class_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "send own class message" ON public.class_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "host or author updates message" ON public.class_messages FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = (SELECT host_id FROM public.live_classes c WHERE c.id = class_id))
  WITH CHECK (auth.uid() = user_id OR auth.uid() = (SELECT host_id FROM public.live_classes c WHERE c.id = class_id));

CREATE TABLE IF NOT EXISTS public.class_message_votes (
  message_id uuid NOT NULL REFERENCES public.class_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.class_message_votes TO authenticated;
GRANT ALL ON public.class_message_votes TO service_role;
ALTER TABLE public.class_message_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "votes readable" ON public.class_message_votes FOR SELECT TO authenticated USING (true);
CREATE POLICY "vote as self" ON public.class_message_votes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "unvote as self" ON public.class_message_votes FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.class_stage_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.live_classes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','ended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, user_id)
);
GRANT SELECT, INSERT, UPDATE ON public.class_stage_requests TO authenticated;
GRANT ALL ON public.class_stage_requests TO service_role;
ALTER TABLE public.class_stage_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stage requests readable" ON public.class_stage_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "request stage as self" ON public.class_stage_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "host or self updates stage" ON public.class_stage_requests FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = (SELECT host_id FROM public.live_classes c WHERE c.id = class_id))
  WITH CHECK (auth.uid() = user_id OR auth.uid() = (SELECT host_id FROM public.live_classes c WHERE c.id = class_id));

CREATE TABLE IF NOT EXISTS public.class_replays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.live_classes(id) ON DELETE CASCADE,
  host_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  video_path text NOT NULL,
  duration_seconds numeric,
  preview_seconds integer NOT NULL DEFAULT 120,
  price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.class_replays TO authenticated;
GRANT ALL ON public.class_replays TO service_role;
ALTER TABLE public.class_replays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "replays readable" ON public.class_replays FOR SELECT TO authenticated USING (true);
CREATE POLICY "host publishes replay" ON public.class_replays FOR INSERT TO authenticated WITH CHECK (auth.uid() = host_id);
CREATE POLICY "host updates replay" ON public.class_replays FOR UPDATE TO authenticated USING (auth.uid() = host_id) WITH CHECK (auth.uid() = host_id);

CREATE INDEX IF NOT EXISTS class_messages_class_idx ON public.class_messages(class_id, created_at DESC);
CREATE INDEX IF NOT EXISTS class_enrollments_class_idx ON public.class_enrollments(class_id);
CREATE INDEX IF NOT EXISTS class_stage_requests_class_idx ON public.class_stage_requests(class_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.class_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.class_stage_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.class_enrollments;
