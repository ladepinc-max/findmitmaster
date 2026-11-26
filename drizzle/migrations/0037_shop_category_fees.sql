CREATE TABLE public.shop_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  value text NOT NULL UNIQUE,
  label text NOT NULL,
  emoji text NOT NULL DEFAULT '🏪',
  is_big_shop boolean NOT NULL DEFAULT false,
  registration_fee numeric(12,2) NOT NULL DEFAULT 200 CHECK (registration_fee >= 0),
  is_waived boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shop_categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_categories TO authenticated;
GRANT ALL ON public.shop_categories TO service_role;
ALTER TABLE public.shop_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads shop categories" ON public.shop_categories FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins insert shop categories" ON public.shop_categories FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_super_admin());
CREATE POLICY "Admins update shop categories" ON public.shop_categories FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin()) WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_super_admin());
CREATE POLICY "Admins delete shop categories" ON public.shop_categories FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin());
CREATE TRIGGER shop_categories_updated_at BEFORE UPDATE ON public.shop_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.shop_categories (value, label, emoji, is_big_shop, registration_fee, sort_order) VALUES
 ('hotel','Hotel / Guest House','🏨',true,500,1),
 ('restaurant','Restaurant','🍽️',true,400,2),
 ('clinic','Hospital / Clinic','➕',true,500,3),
 ('school','School','📚',true,400,4),
 ('food','Food & Drinks','🍴',false,200,10),
 ('provisions','Provisions','🛍️',false,200,11),
 ('pharmacy','Pharmacy','💊',false,200,12),
 ('fashion','Fashion & Beauty','👗',false,200,13),
 ('electronics','Phones & Electronics','📱',false,200,14),
 ('mechanic','Mechanic','🔧',false,200,15),
 ('services','Services','🛠️',false,200,16),
 ('police','Police Station','🛡️',false,200,17),
 ('fireservice','Fire Service','🚒',false,200,18),
 ('shop','Other shop','🏪',false,200,99)
ON CONFLICT (value) DO NOTHING;