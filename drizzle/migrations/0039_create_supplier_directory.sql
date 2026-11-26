CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
  category text NOT NULL CHECK (char_length(category) BETWEEN 1 AND 100),
  phone text NOT NULL CHECK (char_length(phone) BETWEEN 3 AND 30),
  landmark text CHECK (landmark IS NULL OR char_length(landmark) <= 200),
  description text CHECK (description IS NULL OR char_length(description) <= 2000),
  lat double precision,
  lng double precision,
  photo_url text,
  subscription_status text NOT NULL DEFAULT 'pending' CHECK (subscription_status IN ('pending', 'active')),
  subscription_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.suppliers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view active suppliers" ON public.suppliers FOR SELECT TO anon, authenticated
  USING (subscription_status = 'active' AND subscription_expires_at > now());
CREATE POLICY "Owners can view their supplier" ON public.suppliers FOR SELECT TO authenticated
  USING (owner_id = auth.uid());
CREATE POLICY "Owners can register their supplier" ON public.suppliers FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND subscription_status = 'pending' AND subscription_expires_at IS NULL);
CREATE POLICY "Owners can edit their supplier" ON public.suppliers FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owners can delete their supplier" ON public.suppliers FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

CREATE OR REPLACE FUNCTION public.guard_supplier_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND (
    NEW.owner_id IS DISTINCT FROM OLD.owner_id OR
    NEW.subscription_status IS DISTINCT FROM OLD.subscription_status OR
    NEW.subscription_expires_at IS DISTINCT FROM OLD.subscription_expires_at
  ) THEN
    RAISE EXCEPTION 'Supplier subscription fields are managed by FindMit';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_supplier_subscription BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_subscription();

CREATE TABLE public.supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  reference text NOT NULL UNIQUE,
  method text,
  status text NOT NULL DEFAULT 'paid' CHECK (status IN ('paid')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.supplier_payments TO authenticated;
GRANT ALL ON public.supplier_payments TO service_role;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners can view supplier payments" ON public.supplier_payments FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX suppliers_public_directory_idx ON public.suppliers (subscription_status, subscription_expires_at, name);
CREATE INDEX supplier_payments_supplier_idx ON public.supplier_payments (supplier_id, created_at DESC);