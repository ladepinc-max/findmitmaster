-- Featured + applicant counts on jobs
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS applicants_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.sync_job_applicants_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.job_id IS NOT NULL THEN
    UPDATE public.jobs SET applicants_count = applicants_count + 1 WHERE id = NEW.job_id;
  ELSIF TG_OP = 'DELETE' AND OLD.job_id IS NOT NULL THEN
    UPDATE public.jobs SET applicants_count = GREATEST(0, applicants_count - 1) WHERE id = OLD.job_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS job_applications_count_trg ON public.job_applications;
CREATE TRIGGER job_applications_count_trg
AFTER INSERT OR DELETE ON public.job_applications
FOR EACH ROW EXECUTE FUNCTION public.sync_job_applicants_count();

UPDATE public.jobs j
SET applicants_count = COALESCE((SELECT count(*) FROM public.job_applications a WHERE a.job_id = j.id), 0);

-- Private talent contact details
CREATE TABLE IF NOT EXISTS public.talent_contacts (
  talent_profile_id uuid PRIMARY KEY REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text NOT NULL,
  whatsapp text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.talent_contacts TO authenticated;
GRANT ALL ON public.talent_contacts TO service_role;
ALTER TABLE public.talent_contacts ENABLE ROW LEVEL SECURITY;

-- Unlocks purchased by employers
CREATE TABLE IF NOT EXISTS public.talent_unlocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  talent_profile_id uuid NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employer_id, talent_profile_id)
);
GRANT SELECT ON public.talent_unlocks TO authenticated;
GRANT ALL ON public.talent_unlocks TO service_role;
ALTER TABLE public.talent_unlocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employers see their own unlocks"
ON public.talent_unlocks FOR SELECT TO authenticated
USING (employer_id = auth.uid());

CREATE POLICY "Talent owners manage their contact details"
ON public.talent_contacts FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Unlocked employers can read contact details"
ON public.talent_contacts FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.talent_unlocks u
  WHERE u.talent_profile_id = talent_contacts.talent_profile_id
    AND u.employer_id = auth.uid()
));

-- Employer contact credits
CREATE TABLE IF NOT EXISTS public.employer_credits (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  contacts_remaining integer NOT NULL DEFAULT 0,
  featured_credits integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.employer_credits TO authenticated;
GRANT ALL ON public.employer_credits TO service_role;
ALTER TABLE public.employer_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Employers read their own credits"
ON public.employer_credits FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Purchases
CREATE TABLE IF NOT EXISTS public.contact_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'GHS',
  contacts integer NOT NULL DEFAULT 0,
  featured integer NOT NULL DEFAULT 0,
  reference text NOT NULL UNIQUE,
  method text,
  status text NOT NULL DEFAULT 'paid',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.contact_purchases TO authenticated;
GRANT ALL ON public.contact_purchases TO service_role;
ALTER TABLE public.contact_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Employers read their own purchases"
ON public.contact_purchases FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Saved jobs
CREATE TABLE IF NOT EXISTS public.saved_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, job_id)
);
GRANT SELECT, INSERT, DELETE ON public.saved_jobs TO authenticated;
GRANT ALL ON public.saved_jobs TO service_role;
ALTER TABLE public.saved_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their saved jobs"
ON public.saved_jobs FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Spend one credit to unlock a talent contact
CREATE OR REPLACE FUNCTION public.unlock_talent_contact(_talent_profile_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _left integer;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM public.talent_unlocks WHERE employer_id = _uid AND talent_profile_id = _talent_profile_id) THEN
    RETURN true;
  END IF;

  UPDATE public.employer_credits
  SET contacts_remaining = contacts_remaining - 1, updated_at = now()
  WHERE user_id = _uid AND contacts_remaining > 0
  RETURNING contacts_remaining INTO _left;

  IF _left IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.talent_unlocks (employer_id, talent_profile_id)
  VALUES (_uid, _talent_profile_id)
  ON CONFLICT DO NOTHING;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.unlock_talent_contact(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlock_talent_contact(uuid) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_saved_jobs_user ON public.saved_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_talent_unlocks_employer ON public.talent_unlocks(employer_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_job ON public.job_applications(job_id);

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS gender text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS age integer,
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS town text,
  ADD COLUMN IF NOT EXISTS landmark text,
  ADD COLUMN IF NOT EXISTS negotiable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS skills text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS video_paths text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS face_path text,
  ADD COLUMN IF NOT EXISTS face_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'under_review',
  ADD COLUMN IF NOT EXISTS views_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.talent_profiles DROP CONSTRAINT IF EXISTS talent_profiles_rate_period_check;
ALTER TABLE public.talent_profiles ADD CONSTRAINT talent_profiles_rate_period_check
  CHECK (rate_period = ANY (ARRAY['per_day','per_week','per_month','per_project']));
ALTER TABLE public.talent_profiles DROP CONSTRAINT IF EXISTS talent_profiles_gender_check;
ALTER TABLE public.talent_profiles ADD CONSTRAINT talent_profiles_gender_check
  CHECK (gender = ANY (ARRAY['male','female','other']));
ALTER TABLE public.talent_profiles DROP CONSTRAINT IF EXISTS talent_profiles_review_status_check;
ALTER TABLE public.talent_profiles ADD CONSTRAINT talent_profiles_review_status_check
  CHECK (review_status = ANY (ARRAY['under_review','approved','rejected']));

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_salary_period_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_salary_period_check
  CHECK (salary_period = ANY (ARRAY['per_day','per_week','per_month','per_project']));

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS plan text;

CREATE INDEX IF NOT EXISTS jobs_expires_at_idx ON public.jobs (expires_at DESC);
CREATE INDEX IF NOT EXISTS talent_profiles_review_status_idx ON public.talent_profiles (review_status);

CREATE OR REPLACE FUNCTION public.increment_talent_view(_talent_profile_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.talent_profiles SET views_count = views_count + 1 WHERE id = _talent_profile_id;
$$;

REVOKE ALL ON FUNCTION public.increment_talent_view(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_talent_view(uuid) TO authenticated;


CREATE POLICY "talent videos readable by signed-in users"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'talent-videos');

CREATE POLICY "talent videos owner insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'talent-videos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "talent videos owner update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'talent-videos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "talent videos owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'talent-videos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "verification owner select"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'talent-verification' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "verification owner insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'talent-verification' AND (storage.foldername(name))[1] = auth.uid()::text);


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


CREATE POLICY "class media readable by signed-in users" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'class-media');
CREATE POLICY "class media owner insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'class-media' AND (storage.foldername(name))[1] = (auth.uid())::text);
CREATE POLICY "class media owner update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'class-media' AND (storage.foldername(name))[1] = (auth.uid())::text);
CREATE POLICY "class media owner delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'class-media' AND (storage.foldername(name))[1] = (auth.uid())::text);

ALTER TABLE public.class_stage_requests DROP CONSTRAINT IF EXISTS class_stage_requests_status_check;
ALTER TABLE public.class_stage_requests ADD CONSTRAINT class_stage_requests_status_check CHECK (status = ANY (ARRAY['pending'::text,'waiting'::text,'approved'::text,'rejected'::text,'ended'::text]));
