CREATE OR REPLACE FUNCTION public.adjust_live_viewer_count(_session_id uuid, _delta integer) RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ UPDATE public.live_sessions SET viewer_count = GREATEST(viewer_count + _delta, 0) WHERE id = _session_id AND is_live RETURNING viewer_count $$;
CREATE TABLE public.wallet_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'Package',
  amount numeric NOT NULL CHECK (amount > 0),
  duration_days integer NOT NULL CHECK (duration_days > 0),
  areas text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wallet_packages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallet_packages TO authenticated;
GRANT ALL ON public.wallet_packages TO service_role;
ALTER TABLE public.wallet_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone sees active packages" ON public.wallet_packages FOR SELECT
  USING (is_active OR public.has_role(auth.uid(), 'admin') OR public.is_super_admin());
CREATE POLICY "Admins manage packages" ON public.wallet_packages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin())
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_super_admin());
CREATE TRIGGER wallet_packages_updated_at BEFORE UPDATE ON public.wallet_packages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.wallet_passes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  package_id uuid REFERENCES public.wallet_packages(id) ON DELETE SET NULL,
  title text NOT NULL,
  amount numeric NOT NULL,
  areas text[] NOT NULL DEFAULT '{}',
  reference text NOT NULL UNIQUE,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wallet_passes TO authenticated;
GRANT ALL ON public.wallet_passes TO service_role;
ALTER TABLE public.wallet_passes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own passes" ON public.wallet_passes FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.is_super_admin());
CREATE INDEX wallet_passes_user_idx ON public.wallet_passes(user_id, expires_at);
ALTER TABLE public.app_pricing ADD COLUMN IF NOT EXISTS is_waived boolean NOT NULL DEFAULT false;
REVOKE EXECUTE ON FUNCTION public.sync_job_applicants_count() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_counts() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fanout_job_alerts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_live_viewer_count(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_replay(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owns_replay(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_paid_job_post(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.adjust_live_viewer_count(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_replay(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.owns_replay(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_paid_job_post(uuid) FROM PUBLIC, anon;

CREATE POLICY "Service role manages phone verifications"
ON public.phone_verifications FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can update broadcasts" ON public.tv_channels;
CREATE POLICY "Hosts teachers and admins can update broadcasts" ON public.tv_channels FOR UPDATE TO authenticated
USING (host_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher') OR public.is_super_admin())
WITH CHECK (host_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher') OR public.is_super_admin());
INSERT INTO public.app_pricing (key, label, amount) VALUES
 ('graduate_application', 'FindMit Graduate application fee', 350),
 ('company_application', 'FindMit Employer application fee', 3000)
ON CONFLICT (key) DO NOTHING;
CREATE POLICY "Admins can delete any job" ON public.jobs FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete any expertise" ON public.talent_profiles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can view all CVs and verification docs" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'cvs' AND public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins can view all CVs and verification docs" ON storage.objects;
CREATE POLICY "Admins can view all CVs and verification docs" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'cvs' AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin()));
DROP POLICY IF EXISTS "Admins can delete any job" ON public.jobs;
CREATE POLICY "Admins can delete any job" ON public.jobs FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin());
DROP POLICY IF EXISTS "Admins can delete any expertise" ON public.talent_profiles;
CREATE POLICY "Admins can delete any expertise" ON public.talent_profiles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin());
