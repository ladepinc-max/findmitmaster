CREATE TABLE public.live_replays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.live_classes(id) ON DELETE SET NULL,
  title text NOT NULL,
  video_url text NOT NULL,
  thumbnail_url text,
  duration_seconds integer NOT NULL DEFAULT 0,
  views_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_replays TO authenticated;
GRANT ALL ON public.live_replays TO service_role;

ALTER TABLE public.live_replays ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.replay_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  replay_id uuid NOT NULL REFERENCES public.live_replays(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (replay_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.replay_access TO authenticated;
GRANT ALL ON public.replay_access TO service_role;

ALTER TABLE public.replay_access ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_view_replay(_replay_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.live_replays r
    WHERE r.id = _replay_id AND r.teacher_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.replay_access a
    WHERE a.replay_id = _replay_id AND a.user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.owns_replay(_replay_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.live_replays r
    WHERE r.id = _replay_id AND r.teacher_id = _user_id
  );
$$;

CREATE POLICY "replays viewable by teacher or granted students"
  ON public.live_replays FOR SELECT TO authenticated
  USING (teacher_id = auth.uid() OR public.can_view_replay(id, auth.uid()));

CREATE POLICY "teacher creates own replays"
  ON public.live_replays FOR INSERT TO authenticated
  WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "viewers can update replay row"
  ON public.live_replays FOR UPDATE TO authenticated
  USING (teacher_id = auth.uid() OR public.can_view_replay(id, auth.uid()))
  WITH CHECK (teacher_id = auth.uid() OR public.can_view_replay(id, auth.uid()));

CREATE POLICY "teacher deletes own replays"
  ON public.live_replays FOR DELETE TO authenticated
  USING (teacher_id = auth.uid());

CREATE POLICY "access rows visible to student and teacher"
  ON public.replay_access FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.owns_replay(replay_id, auth.uid()));

CREATE POLICY "teacher grants access"
  ON public.replay_access FOR INSERT TO authenticated
  WITH CHECK (public.owns_replay(replay_id, auth.uid()));

CREATE POLICY "teacher revokes access"
  ON public.replay_access FOR DELETE TO authenticated
  USING (public.owns_replay(replay_id, auth.uid()));

CREATE TRIGGER live_replays_updated_at
  BEFORE UPDATE ON public.live_replays
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX live_replays_teacher_idx ON public.live_replays (teacher_id, created_at DESC);
CREATE INDEX replay_access_user_idx ON public.replay_access (user_id, granted_at DESC);