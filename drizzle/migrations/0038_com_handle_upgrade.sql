ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS com_handle_paid boolean NOT NULL DEFAULT false;
INSERT INTO public.app_pricing (key, label, amount) VALUES ('shop_com_handle', 'Premium .com shop link (one-time)', 200) ON CONFLICT (key) DO NOTHING;
CREATE OR REPLACE FUNCTION public.guard_shop_subscription()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF coalesce(auth.jwt() ->> 'role', '') = 'service_role' OR auth.uid() IS NULL AND current_user IN ('postgres','supabase_admin') OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.subscription_status := 'pending_payment';
    NEW.subscription_expires_at := NULL;
    NEW.com_handle_paid := false;
  ELSE
    NEW.subscription_status := OLD.subscription_status;
    NEW.subscription_expires_at := OLD.subscription_expires_at;
    NEW.owner_id := OLD.owner_id;
    NEW.handle := OLD.handle;
    NEW.com_handle_paid := OLD.com_handle_paid;
  END IF;
  RETURN NEW;
END $$;