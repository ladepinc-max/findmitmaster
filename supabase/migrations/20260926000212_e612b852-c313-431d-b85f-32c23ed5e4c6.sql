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