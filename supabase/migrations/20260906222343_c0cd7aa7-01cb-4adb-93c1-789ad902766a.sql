CREATE TABLE IF NOT EXISTS public.profile_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#25D366',
  icon text NOT NULL DEFAULT 'folder',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_folders TO authenticated;
GRANT ALL ON public.profile_folders TO service_role;
ALTER TABLE public.profile_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own folders" ON public.profile_folders FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS profile_folders_user_idx ON public.profile_folders(user_id);

CREATE TABLE IF NOT EXISTS public.folder_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL REFERENCES public.profile_folders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('video','image','live_replay')),
  item_id uuid NOT NULL,
  title text,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (folder_id, item_type, item_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.folder_items TO authenticated;
GRANT ALL ON public.folder_items TO service_role;
ALTER TABLE public.folder_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own folder items" ON public.folder_items FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS folder_items_folder_idx ON public.folder_items(folder_id);

ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS replay_url text,
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS duration_seconds numeric;

CREATE TABLE IF NOT EXISTS public.live_classroom_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  live_session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  watched_at timestamptz NOT NULL DEFAULT now(),
  duration_watched numeric NOT NULL DEFAULT 0,
  UNIQUE (live_session_id, student_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_classroom_views TO authenticated;
GRANT ALL ON public.live_classroom_views TO service_role;
ALTER TABLE public.live_classroom_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "students manage own views" ON public.live_classroom_views FOR ALL TO authenticated
  USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());
CREATE POLICY "hosts read views of their classes" ON public.live_classroom_views FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.live_sessions s WHERE s.id = live_session_id AND s.host_id = auth.uid()));
CREATE INDEX IF NOT EXISTS live_classroom_views_student_idx ON public.live_classroom_views(student_id);

CREATE TRIGGER profile_folders_updated_at BEFORE UPDATE ON public.profile_folders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();