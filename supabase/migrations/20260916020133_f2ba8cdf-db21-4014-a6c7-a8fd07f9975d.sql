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