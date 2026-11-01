CREATE TABLE public.home_quick_apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  url text NOT NULL,
  color text NOT NULL DEFAULT '#16a34a',
  icon_text text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.home_quick_apps TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.home_quick_apps TO authenticated;
GRANT ALL ON public.home_quick_apps TO service_role;
ALTER TABLE public.home_quick_apps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quick apps readable" ON public.home_quick_apps FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admins manage quick apps" ON public.home_quick_apps FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin())
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_super_admin());

CREATE TABLE public.home_feed_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'news',
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  image_url text,
  link_url text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.home_feed_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.home_feed_items TO authenticated;
GRANT ALL ON public.home_feed_items TO service_role;
ALTER TABLE public.home_feed_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "active feed readable" ON public.home_feed_items FOR SELECT TO anon, authenticated
  USING (is_active OR public.has_role(auth.uid(), 'admin') OR public.is_super_admin());
CREATE POLICY "admins manage feed" ON public.home_feed_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin())
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_super_admin());

INSERT INTO public.home_quick_apps (label, url, color, icon_text, sort_order) VALUES
  ('GhanaWeb', 'https://www.ghanaweb.com', '#2b8fd6', 'G', 1),
  ('Tonaton', 'https://tonaton.com', '#f08a24', 'T', 2),
  ('Jumia', 'https://www.jumia.com.gh', '#f5a623', 'J', 3),
  ('YouTube', 'https://m.youtube.com', '#ff0000', '▶', 4),
  ('Facebook', 'https://m.facebook.com', '#1877f2', 'f', 5);