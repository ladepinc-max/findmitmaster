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