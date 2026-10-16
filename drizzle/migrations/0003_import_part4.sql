
-- roles
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','moderator','user','teacher');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- profile verification
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS completed_projects integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS skill_score integer NOT NULL DEFAULT 0;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_verification_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_verification_status_check
  CHECK (verification_status IN ('none','pending','verified'));

-- job/company verification
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS company_verification_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS meets_requirements boolean NOT NULL DEFAULT false;
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_company_verification_status_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_company_verification_status_check
  CHECK (company_verification_status IN ('none','pending','verified'));
CREATE INDEX IF NOT EXISTS jobs_company_verification_idx ON public.jobs (company_verification_status);
CREATE INDEX IF NOT EXISTS profiles_verification_idx ON public.profiles (verification_status);

-- talent verification applications
CREATE TABLE public.talent_verification_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cv_path text,
  projects text not null default '',
  reason text not null default '',
  fee_reference text,
  status text not null default 'pending',
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  CONSTRAINT talent_verification_status_check CHECK (status IN ('pending','approved','rejected'))
);
GRANT SELECT, INSERT, UPDATE ON public.talent_verification_applications TO authenticated;
GRANT ALL ON public.talent_verification_applications TO service_role;
ALTER TABLE public.talent_verification_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own talent applications read" ON public.talent_verification_applications
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "own talent applications insert" ON public.talent_verification_applications
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admin talent applications update" ON public.talent_verification_applications
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- company verification applications
CREATE TABLE public.company_verification_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_name text not null,
  tin text not null,
  ssnit_proof_path text,
  insurance_policy_path text,
  documents_paths text[] not null default '{}',
  salary_min numeric,
  salary_max numeric,
  status text not null default 'pending',
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  CONSTRAINT company_verification_status_check CHECK (status IN ('pending','approved','rejected'))
);
GRANT SELECT, INSERT, UPDATE ON public.company_verification_applications TO authenticated;
GRANT ALL ON public.company_verification_applications TO service_role;
ALTER TABLE public.company_verification_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own company applications read" ON public.company_verification_applications
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "own company applications insert" ON public.company_verification_applications
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admin company applications update" ON public.company_verification_applications
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER talent_verification_set_updated_at BEFORE UPDATE ON public.talent_verification_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER company_verification_set_updated_at BEFORE UPDATE ON public.company_verification_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- admins may flip verification states
CREATE POLICY "Admins update any profile verification" ON public.profiles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update any job verification" ON public.jobs
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_to uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_for_everyone boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

CREATE TABLE IF NOT EXISTS public.chat_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.messages(id) ON DELETE CASCADE,
  pinned boolean NOT NULL DEFAULT false,
  muted boolean NOT NULL DEFAULT false,
  starred boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_prefs_user_conversation_key
  ON public.chat_prefs (user_id, conversation_id) WHERE message_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS chat_prefs_user_message_key
  ON public.chat_prefs (user_id, message_id) WHERE message_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_prefs TO authenticated;
GRANT ALL ON public.chat_prefs TO service_role;

ALTER TABLE public.chat_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own chat prefs"
  ON public.chat_prefs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER chat_prefs_set_updated_at
  BEFORE UPDATE ON public.chat_prefs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS is_group boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_community boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS avatar_path text,
  ADD COLUMN IF NOT EXISTS community_id uuid;

ALTER TABLE public.chat_members
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member';

CREATE TABLE IF NOT EXISTS public.communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  avatar_path text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  announcement_chat_id uuid REFERENCES public.chats(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.communities TO authenticated;
GRANT ALL ON public.communities TO service_role;

ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed in users can browse communities"
  ON public.communities FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can create communities"
  ON public.communities FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creators can update their communities"
  ON public.communities FOR UPDATE TO authenticated
  USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creators can delete their communities"
  ON public.communities FOR DELETE TO authenticated USING (auth.uid() = created_by);

DROP TRIGGER IF EXISTS communities_set_updated_at ON public.communities;
CREATE TRIGGER communities_set_updated_at
  BEFORE UPDATE ON public.communities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.chats
  ADD CONSTRAINT chats_community_id_fkey FOREIGN KEY (community_id)
  REFERENCES public.communities(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS chats_community_id_idx ON public.chats(community_id);
CREATE INDEX IF NOT EXISTS chat_members_user_id_idx ON public.chat_members(user_id);
CREATE INDEX IF NOT EXISTS messages_chat_id_created_at_idx ON public.messages(chat_id, created_at);

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
ALTER TABLE public.talent_verification_applications
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS location_name text,
  ADD COLUMN IF NOT EXISTS ghana_card text,
  ADD COLUMN IF NOT EXISTS skill_trade text,
  ADD COLUMN IF NOT EXISTS learning_pathway text,
  ADD COLUMN IF NOT EXISTS master_trainer text,
  ADD COLUMN IF NOT EXISTS years_experience text,
  ADD COLUMN IF NOT EXISTS evidence_option text DEFAULT 'video',
  ADD COLUMN IF NOT EXISTS video1_path text,
  ADD COLUMN IF NOT EXISTS video2_path text,
  ADD COLUMN IF NOT EXISTS certificate_path text,
  ADD COLUMN IF NOT EXISTS photo_paths text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS short_bio text,
  ADD COLUMN IF NOT EXISTS findmit_user_id text;
ALTER TABLE public.company_verification_applications
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS region_city text,
  ADD COLUMN IF NOT EXISTS company_size text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS official_email text,
  ADD COLUMN IF NOT EXISTS ghana_card_number text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS hr_contact_name text,
  ADD COLUMN IF NOT EXISTS hr_contact_position text,
  ADD COLUMN IF NOT EXISTS staff_count integer,
  ADD COLUMN IF NOT EXISTS workers_compensation_path text,
  ADD COLUMN IF NOT EXISTS registration_ghana_card_path text,
  ADD COLUMN IF NOT EXISTS information_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verification_fee numeric NOT NULL DEFAULT 3000,
  ADD COLUMN IF NOT EXISTS fee_currency text NOT NULL DEFAULT 'GHS';
CREATE TABLE public.notification_prefs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_enabled boolean NOT NULL DEFAULT true,
  sound_enabled boolean NOT NULL DEFAULT true,
  vibrate_enabled boolean NOT NULL DEFAULT true,
  preview_enabled boolean NOT NULL DEFAULT true,
  live_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_prefs TO authenticated;
GRANT ALL ON public.notification_prefs TO service_role;
ALTER TABLE public.notification_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notification prefs" ON public.notification_prefs FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER notification_prefs_set_updated_at BEFORE UPDATE ON public.notification_prefs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL DEFAULT 'web',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own push subscriptions" ON public.push_subscriptions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER push_subscriptions_set_updated_at BEFORE UPDATE ON public.push_subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.skipped_live_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, class_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.skipped_live_classes TO authenticated;
GRANT ALL ON public.skipped_live_classes TO service_role;
ALTER TABLE public.skipped_live_classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own skipped classes" ON public.skipped_live_classes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY "enrollments readable" ON public.class_enrollments;

CREATE POLICY "enrollments readable"
ON public.class_enrollments
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.live_classes lc
    WHERE lc.id = class_enrollments.class_id
      AND lc.host_id = auth.uid()
  )
);
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
CREATE POLICY "teacher writes own replay files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'live-replays' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "teacher updates own replay files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'live-replays' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'live-replays' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "teacher deletes own replay files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'live-replays' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "replay files readable by teacher or granted students"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'live-replays'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1
        FROM public.live_replays r
        JOIN public.replay_access a ON a.replay_id = r.id
        WHERE a.user_id = auth.uid()
          AND (r.video_url = storage.objects.name OR r.thumbnail_url = storage.objects.name)
      )
    )
  );
