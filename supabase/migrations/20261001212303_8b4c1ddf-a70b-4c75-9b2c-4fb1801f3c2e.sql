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