CREATE TABLE public.teacher_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  age integer not null,
  current_school text not null,
  ghana_card_front_url text not null,
  ghana_card_back_url text not null,
  personal_contact text not null,
  hod_contact text not null,
  facial_verification_url text not null,
  match_score numeric not null default 0,
  status text not null default 'pending',
  reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE ON public.teacher_applications TO authenticated;
GRANT ALL ON public.teacher_applications TO service_role;

ALTER TABLE public.teacher_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own teacher application"
ON public.teacher_applications FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users read own teacher application"
ON public.teacher_applications FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update teacher applications"
ON public.teacher_applications FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER teacher_applications_updated_at
BEFORE UPDATE ON public.teacher_applications
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX teacher_applications_status_idx ON public.teacher_applications (status, created_at DESC);

-- Admins may grant roles (e.g. promote an approved applicant to teacher)
CREATE POLICY "Admins manage user roles"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete user roles"
ON public.user_roles FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Private storage buckets policies
CREATE POLICY "Users manage own verification uploads"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id IN ('ghana-cards','facial-verification') AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users read own verification uploads"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id IN ('ghana-cards','facial-verification') AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin')));
CREATE TABLE public.app_pricing (key text PRIMARY KEY, label text NOT NULL, amount integer NOT NULL CHECK (amount >= 0), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.app_pricing TO anon, authenticated;
GRANT UPDATE ON public.app_pricing TO authenticated;
GRANT ALL ON public.app_pricing TO service_role;
ALTER TABLE public.app_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read prices" ON public.app_pricing FOR SELECT USING (true);
CREATE POLICY "Admins update prices" ON public.app_pricing FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin())
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_super_admin());
CREATE TRIGGER app_pricing_updated BEFORE UPDATE ON public.app_pricing FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.app_pricing (key,label,amount) VALUES
 ('classroom_raise','Classroom Raise Hand',20),('job_post','Job Post',50),('job_apply','Job Apply',10);
CREATE TABLE IF NOT EXISTS public.live_config (id int PRIMARY KEY, whip_url text, hls_url text, whep_url text, rtmps_url text, rtmps_key text, input_id text, customer text, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE ON public.live_config TO authenticated;
GRANT ALL ON public.live_config TO service_role;
ALTER TABLE public.live_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage live config" ON public.live_config FOR ALL TO authenticated
USING (public.is_super_admin() OR public.has_role(auth.uid(),'admin'))
WITH CHECK (public.is_super_admin() OR public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.live_now (id int PRIMARY KEY, is_live boolean NOT NULL DEFAULT false, hls_url text, whep_url text, title text, started_at timestamptz);
GRANT SELECT ON public.live_now TO anon, authenticated;
GRANT INSERT, UPDATE ON public.live_now TO authenticated;
GRANT ALL ON public.live_now TO service_role;
ALTER TABLE public.live_now ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can see live status" ON public.live_now FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins set live status" ON public.live_now FOR ALL TO authenticated
USING (public.is_super_admin() OR public.has_role(auth.uid(),'admin'))
WITH CHECK (public.is_super_admin() OR public.has_role(auth.uid(),'admin'));

INSERT INTO public.live_config (id, whip_url, hls_url, whep_url, rtmps_url, rtmps_key, input_id, customer) VALUES (1,
'https://customer-zjtmy6dnbo1t4dyo.cloudflarestream.com/3c228d289f9f0282b8f8bbee1bcd689ckaac6e92bea05b07ec9c4789aa5effc31/webRTC/publish',
'https://customer-zjtmy6dnbo1t4dyo.cloudflarestream.com/aac6e92bea05b07ec9c4789aa5effc31/manifest/video.m3u8',
'https://customer-zjtmy6dnbo1t4dyo.cloudflarestream.com/aac6e92bea05b07ec9c4789aa5effc31/webRTC/play',
'rtmps://live.cloudflare.com:443/live/','cc61da8d301625140a48d1bfad353aeakaac6e92bea05b07ec9c4789aa5effc31',
'aac6e92bea05b07ec9c4789aa5effc31','customer-zjtmy6dnbo1t4dyo.cloudflarestream.com')
ON CONFLICT (id) DO UPDATE SET whip_url=EXCLUDED.whip_url, hls_url=EXCLUDED.hls_url, whep_url=EXCLUDED.whep_url, rtmps_url=EXCLUDED.rtmps_url, rtmps_key=EXCLUDED.rtmps_key, input_id=EXCLUDED.input_id, customer=EXCLUDED.customer;
INSERT INTO public.live_now (id, is_live) VALUES (1, false) ON CONFLICT (id) DO NOTHING;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_now;
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
CREATE POLICY "Anyone can read tv ads files" ON storage.objects FOR SELECT USING (bucket_id = 'tv-ads');
CREATE POLICY "Admins upload tv ads files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'tv-ads' AND (public.is_super_admin() OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "Admins delete tv ads files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'tv-ads' AND (public.is_super_admin() OR public.has_role(auth.uid(),'admin')));
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS stream_uid text,
  ADD COLUMN IF NOT EXISTS hls_url text;
ALTER TABLE public.live_classes ADD COLUMN IF NOT EXISTS stream_input_uid text;
