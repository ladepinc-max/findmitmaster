CREATE TABLE public.shop_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  product_id uuid REFERENCES public.shop_products(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 80),
  caption text NOT NULL DEFAULT '' CHECK (char_length(caption) <= 200),
  media_path text NOT NULL,
  media_type text NOT NULL CHECK (media_type IN ('image','video')),
  weeks int NOT NULL DEFAULT 1 CHECK (weeks BETWEEN 1 AND 8),
  status text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','active','disabled')),
  paid_reference text UNIQUE,
  expires_at timestamptz,
  clicks int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shop_ads TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_ads TO authenticated;
GRANT ALL ON public.shop_ads TO service_role;
ALTER TABLE public.shop_ads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Live ads are public" ON public.shop_ads FOR SELECT TO anon, authenticated
  USING (status = 'active' AND expires_at > now());
CREATE POLICY "Owners see own ads" ON public.shop_ads FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Admins see all ads" ON public.shop_ads FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Owners create unpaid ads" ON public.shop_ads FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND status = 'unpaid' AND paid_reference IS NULL AND expires_at IS NULL
    AND EXISTS (SELECT 1 FROM public.shops s WHERE s.id = shop_id AND s.owner_id = auth.uid()));
CREATE POLICY "Owners delete own ads" ON public.shop_ads FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Admins manage ads" ON public.shop_ads FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete ads" ON public.shop_ads FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.increment_shop_ad_click(_ad_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.shop_ads SET clicks = clicks + 1 WHERE id = _ad_id AND status = 'active';
$$;
GRANT EXECUTE ON FUNCTION public.increment_shop_ad_click(uuid) TO anon, authenticated;

INSERT INTO public.app_pricing (key, label, amount) VALUES ('shop_ad_week', 'Shop advert (per week)', 50)
  ON CONFLICT (key) DO NOTHING;

CREATE POLICY "Shop ad media readable" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'shop-ads');
CREATE POLICY "Owners upload ad media" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'shop-ads' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Owners delete ad media" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'shop-ads' AND (storage.foldername(name))[1] = auth.uid()::text);