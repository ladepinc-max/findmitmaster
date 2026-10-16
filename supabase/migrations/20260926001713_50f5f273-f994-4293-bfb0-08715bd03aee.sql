CREATE TABLE public.tv_folders (id text PRIMARY KEY, label text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.tv_folders TO anon, authenticated;
GRANT ALL ON public.tv_folders TO service_role;
ALTER TABLE public.tv_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view folders" ON public.tv_folders FOR SELECT USING (true);
INSERT INTO public.tv_folders (id,label) VALUES ('shs','SHS TV'),('jhs','JHS TV'),('primary','PRIMARY TV'),('vocational','VOCATIONAL TV'),('kids','KIDS TV');

CREATE TABLE public.tv_folder_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id text NOT NULL REFERENCES public.tv_folders(id) ON DELETE CASCADE,
  video_url text NOT NULL,
  title text,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tv_folder_ads TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tv_folder_ads TO authenticated;
GRANT ALL ON public.tv_folder_ads TO service_role;
ALTER TABLE public.tv_folder_ads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public sees published ads" ON public.tv_folder_ads FOR SELECT USING (is_published OR public.is_super_admin() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage ads" ON public.tv_folder_ads FOR ALL TO authenticated USING (public.is_super_admin() OR public.has_role(auth.uid(),'admin')) WITH CHECK (public.is_super_admin() OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER tv_folder_ads_updated BEFORE UPDATE ON public.tv_folder_ads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.tv_ad_settings (
  folder_id text PRIMARY KEY REFERENCES public.tv_folders(id) ON DELETE CASCADE,
  ad_interval_minutes integer NOT NULL DEFAULT 10,
  ads_per_break integer NOT NULL DEFAULT 2,
  moving_text text NOT NULL DEFAULT '',
  moving_text_draft text NOT NULL DEFAULT '',
  moving_text_enabled boolean NOT NULL DEFAULT true,
  moving_text_speed integer NOT NULL DEFAULT 20,
  moving_text_position text NOT NULL DEFAULT 'bottom',
  moving_text_published boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tv_ad_settings TO anon;
GRANT SELECT, INSERT, UPDATE ON public.tv_ad_settings TO authenticated;
GRANT ALL ON public.tv_ad_settings TO service_role;
ALTER TABLE public.tv_ad_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads ad settings" ON public.tv_ad_settings FOR SELECT USING (true);
CREATE POLICY "Admins insert ad settings" ON public.tv_ad_settings FOR INSERT TO authenticated WITH CHECK (public.is_super_admin() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update ad settings" ON public.tv_ad_settings FOR UPDATE TO authenticated USING (public.is_super_admin() OR public.has_role(auth.uid(),'admin')) WITH CHECK (public.is_super_admin() OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER tv_ad_settings_updated BEFORE UPDATE ON public.tv_ad_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.tv_ad_settings (folder_id) SELECT id FROM public.tv_folders;
ALTER TABLE public.tv_ad_settings REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tv_ad_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tv_folder_ads;