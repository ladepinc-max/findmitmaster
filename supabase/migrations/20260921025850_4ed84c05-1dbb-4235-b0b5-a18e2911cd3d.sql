CREATE TABLE public.job_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'GHS',
  reference text NOT NULL UNIQUE,
  method text,
  status text NOT NULL DEFAULT 'paid',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT ON public.job_payments TO authenticated;
GRANT ALL ON public.job_payments TO service_role;
ALTER TABLE public.job_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Employers read own job payments" ON public.job_payments
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.is_super_admin());
CREATE TRIGGER job_payments_updated_at BEFORE UPDATE ON public.job_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.expertise_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  talent_profile_id uuid REFERENCES public.talent_profiles(id) ON DELETE SET NULL,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'GHS',
  reference text NOT NULL UNIQUE,
  method text,
  status text NOT NULL DEFAULT 'paid',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT ON public.expertise_payments TO authenticated;
GRANT ALL ON public.expertise_payments TO service_role;
ALTER TABLE public.expertise_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workers read own expertise payments" ON public.expertise_payments
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.is_super_admin());
CREATE TRIGGER expertise_payments_updated_at BEFORE UPDATE ON public.expertise_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS is_paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paid_at timestamp with time zone;

CREATE OR REPLACE FUNCTION public.has_paid_job_post(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.job_payments
    WHERE user_id = _user_id AND status = 'paid' AND amount >= 200
  )
$$;

DROP POLICY IF EXISTS "Unlocked employers can read contact details" ON public.talent_contacts;
CREATE POLICY "Contact details for owners, admins and paying employers" ON public.talent_contacts
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.is_super_admin()
    OR public.has_paid_job_post(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.talent_unlocks u
      WHERE u.talent_profile_id = talent_contacts.talent_profile_id AND u.employer_id = auth.uid()
    )
  );