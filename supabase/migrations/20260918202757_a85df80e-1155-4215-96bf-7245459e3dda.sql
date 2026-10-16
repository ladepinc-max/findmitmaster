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