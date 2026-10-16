CREATE OR REPLACE FUNCTION public.guard_shop_subscription()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF coalesce(auth.jwt() ->> 'role', '') = 'service_role' OR auth.uid() IS NULL AND current_user IN ('postgres','supabase_admin') OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;
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