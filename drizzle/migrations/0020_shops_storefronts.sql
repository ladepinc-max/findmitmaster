CREATE TABLE public.shops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  handle text NOT NULL UNIQUE CHECK (handle ~ '^[a-z0-9][a-z0-9._]{2,29}$'),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'shop',
  phone text NOT NULL DEFAULT '',
  landmark text,
  description text,
  lat double precision,
  lng double precision,
  photo_url text,
  subscription_status text NOT NULL DEFAULT 'pending_payment',
  subscription_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shops_owner_idx ON public.shops(owner_id);
GRANT SELECT ON public.shops TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shops TO authenticated;
GRANT ALL ON public.shops TO service_role;
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.shop_is_active(_shop_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.shops s WHERE s.id = _shop_id
    AND s.subscription_status = 'active' AND s.subscription_expires_at > now())
$$;
CREATE OR REPLACE FUNCTION public.owns_shop(_shop_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.shops s WHERE s.id = _shop_id AND s.owner_id = _user_id)
$$;
CREATE OR REPLACE FUNCTION public.is_shop_handle_available(_handle text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.shops WHERE handle = lower(_handle))
$$;
GRANT EXECUTE ON FUNCTION public.is_shop_handle_available(text) TO anon, authenticated;

CREATE POLICY "Active shops are public" ON public.shops FOR SELECT
  USING ((subscription_status = 'active' AND subscription_expires_at > now()) OR owner_id = auth.uid() OR public.is_super_admin());
CREATE POLICY "Owners create shops" ON public.shops FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owners update shops" ON public.shops FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.is_super_admin()) WITH CHECK (owner_id = auth.uid() OR public.is_super_admin());
CREATE POLICY "Owners delete shops" ON public.shops FOR DELETE TO authenticated USING (owner_id = auth.uid() OR public.is_super_admin());

-- Only the server (after verified payment) or the super admin may change subscription fields.
CREATE OR REPLACE FUNCTION public.guard_shop_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_user IN ('service_role','postgres','supabase_admin') OR public.is_super_admin() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.subscription_status := 'pending_payment';
    NEW.subscription_expires_at := NULL;
  ELSE
    NEW.subscription_status := OLD.subscription_status;
    NEW.subscription_expires_at := OLD.subscription_expires_at;
    NEW.owner_id := OLD.owner_id;
    NEW.handle := OLD.handle;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER shops_guard_subscription BEFORE INSERT OR UPDATE ON public.shops FOR EACH ROW EXECUTE FUNCTION public.guard_shop_subscription();
CREATE TRIGGER shops_set_updated_at BEFORE UPDATE ON public.shops FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.shop_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price_ghc numeric(12,2) NOT NULL DEFAULT 0 CHECK (price_ghc >= 0),
  photo_url text,
  is_available boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shop_products_shop_idx ON public.shop_products(shop_id);
GRANT SELECT ON public.shop_products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_products TO authenticated;
GRANT ALL ON public.shop_products TO service_role;
ALTER TABLE public.shop_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Products of active shops are public" ON public.shop_products FOR SELECT
  USING (public.shop_is_active(shop_id) OR public.owns_shop(shop_id, auth.uid()));
CREATE POLICY "Paid owners add products" ON public.shop_products FOR INSERT TO authenticated
  WITH CHECK (public.owns_shop(shop_id, auth.uid()) AND public.shop_is_active(shop_id));
CREATE POLICY "Paid owners edit products" ON public.shop_products FOR UPDATE TO authenticated
  USING (public.owns_shop(shop_id, auth.uid()) AND public.shop_is_active(shop_id));
CREATE POLICY "Owners delete products" ON public.shop_products FOR DELETE TO authenticated
  USING (public.owns_shop(shop_id, auth.uid()));

CREATE TABLE public.shop_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  amount integer NOT NULL,
  reference text NOT NULL UNIQUE,
  method text,
  status text NOT NULL DEFAULT 'paid',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shop_payments TO authenticated;
GRANT ALL ON public.shop_payments TO service_role;
ALTER TABLE public.shop_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners see own shop payments" ON public.shop_payments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin());

CREATE POLICY "Shop media public read" ON storage.objects FOR SELECT USING (bucket_id = 'shop-media');
CREATE POLICY "Users upload own shop media" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'shop-media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete own shop media" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'shop-media' AND (storage.foldername(name))[1] = auth.uid()::text);