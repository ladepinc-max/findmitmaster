CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT lower(coalesce(auth.jwt() ->> 'email', '')) = 'findmitedutech@gmail.com' $$;
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS tv_category text CHECK (tv_category IS NULL OR tv_category IN ('shs','jhs','primary','vocational','kids')),
  ADD COLUMN IF NOT EXISTS tv_type text CHECK (tv_type IS NULL OR tv_type IN ('live','on_demand'));

CREATE INDEX IF NOT EXISTS idx_posts_tv_category_published
  ON public.posts (tv_category, created_at DESC)
  WHERE status = 'published' AND tv_category IS NOT NULL;
CREATE TABLE public.tv_channels (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL UNIQUE,
  host_id uuid REFERENCES auth.users ON DELETE SET NULL,
  subject text NOT NULL DEFAULT '',
  started_at timestamptz,
  total_seconds numeric NOT NULL DEFAULT 0,
  viewers_seed integer NOT NULL DEFAULT 12400,
  is_live boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tv_channels TO anon;
GRANT SELECT, INSERT, UPDATE ON public.tv_channels TO authenticated;
GRANT ALL ON public.tv_channels TO service_role;

ALTER TABLE public.tv_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view tv channels" ON public.tv_channels FOR SELECT USING (true);
CREATE POLICY "Authenticated can start broadcasts" ON public.tv_channels FOR INSERT TO authenticated WITH CHECK (auth.uid() = host_id);
CREATE POLICY "Authenticated can update broadcasts" ON public.tv_channels FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE TRIGGER tv_channels_set_updated_at BEFORE UPDATE ON public.tv_channels FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.tv_channels;
CREATE TABLE public.app_sections (
  id text PRIMARY KEY,
  is_hidden boolean NOT NULL DEFAULT true,
  is_locked boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_sections TO anon;
GRANT SELECT, UPDATE ON public.app_sections TO authenticated;
GRANT ALL ON public.app_sections TO service_role;

ALTER TABLE public.app_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read app sections"
ON public.app_sections FOR SELECT
USING (true);

CREATE POLICY "Super admin can update app sections"
ON public.app_sections FOR UPDATE
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE TRIGGER app_sections_updated_at
BEFORE UPDATE ON public.app_sections
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.app_sections (id) VALUES
  ('shs_tv_upload'),
  ('jhs_tv_upload'),
  ('primary_tv_upload'),
  ('vocational_tv_upload'),
  ('kids_tv_upload'),
  ('go_live_now'),
  ('findmit_ghana_tab'),
  ('chat_button');

ALTER PUBLICATION supabase_realtime ADD TABLE public.app_sections;
CREATE TABLE public.partner_tvs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text,
  category text NOT NULL DEFAULT 'General',
  region text,
  description text,
  live_stream_url text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  viewer_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.partner_tvs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_tvs TO authenticated;
GRANT ALL ON public.partner_tvs TO service_role;

ALTER TABLE public.partner_tvs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view partner tvs" ON public.partner_tvs FOR SELECT USING (true);
CREATE POLICY "Super admin can insert partner tvs" ON public.partner_tvs FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());
CREATE POLICY "Super admin can update partner tvs" ON public.partner_tvs FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Super admin can delete partner tvs" ON public.partner_tvs FOR DELETE TO authenticated USING (public.is_super_admin());

CREATE TRIGGER partner_tvs_updated_at BEFORE UPDATE ON public.partner_tvs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.increment_partner_tv_viewers(_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.partner_tvs SET viewer_count = viewer_count + 1 WHERE id = _id AND is_active;
$$;
GRANT EXECUTE ON FUNCTION public.increment_partner_tv_viewers(uuid) TO anon, authenticated;
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE email = 'ladepinc@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;
ALTER TABLE public.live_classes ADD COLUMN IF NOT EXISTS hls_url text;
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
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS payment_momo_number text,
  ADD COLUMN IF NOT EXISTS payment_momo_provider text;
-- Replace the super-admin-only write policies with admin-or-super-admin versions
DROP POLICY IF EXISTS "Super admin can insert partner tvs" ON public.partner_tvs;
DROP POLICY IF EXISTS "Super admin can update partner tvs" ON public.partner_tvs;
DROP POLICY IF EXISTS "Super admin can delete partner tvs" ON public.partner_tvs;

CREATE POLICY "Admins can insert partner tvs" ON public.partner_tvs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update partner tvs" ON public.partner_tvs
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_super_admin() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete partner tvs" ON public.partner_tvs
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS tv_order integer;
ALTER TABLE public.tv_channels ADD COLUMN IF NOT EXISTS scheduled_start timestamptz;
CREATE INDEX IF NOT EXISTS posts_tv_category_order_idx ON public.posts (tv_category, tv_order);
