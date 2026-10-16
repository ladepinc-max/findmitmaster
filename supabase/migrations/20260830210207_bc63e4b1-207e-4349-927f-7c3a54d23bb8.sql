
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
