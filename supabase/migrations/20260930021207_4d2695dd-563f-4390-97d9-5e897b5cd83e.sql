ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_phone_to text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS show_email_to text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS contact_email text;

CREATE TABLE IF NOT EXISTS public.contact_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  allow_phone boolean NOT NULL DEFAULT true,
  allow_email boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (owner_id, viewer_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_permissions TO authenticated;
GRANT ALL ON public.contact_permissions TO service_role;

ALTER TABLE public.contact_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their contact permissions"
  ON public.contact_permissions FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Viewers can see permissions granted to them"
  ON public.contact_permissions FOR SELECT TO authenticated
  USING (auth.uid() = viewer_id);

CREATE TRIGGER contact_permissions_set_updated_at
  BEFORE UPDATE ON public.contact_permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.can_view_contact(_owner_id uuid, _viewer_id uuid, _field text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _owner_id = _viewer_id THEN true
    ELSE COALESCE((
      SELECT CASE
        WHEN (_field = 'phone' AND p.show_phone_to = 'public')
          OR (_field = 'email' AND p.show_email_to = 'public') THEN true
        WHEN (_field = 'phone' AND p.show_phone_to = 'friends')
          OR (_field = 'email' AND p.show_email_to = 'friends') THEN EXISTS (
            SELECT 1 FROM public.follows f1
            JOIN public.follows f2
              ON f2.follower_id = f1.following_id AND f2.following_id = f1.follower_id
            WHERE f1.follower_id = _owner_id AND f1.following_id = _viewer_id
          )
        ELSE false
      END
      FROM public.profiles p WHERE p.id = _owner_id
    ), false)
      OR EXISTS (
        SELECT 1 FROM public.contact_permissions cp
        WHERE cp.owner_id = _owner_id AND cp.viewer_id = _viewer_id
          AND ((_field = 'phone' AND cp.allow_phone) OR (_field = 'email' AND cp.allow_email))
      )
  END
$$;

CREATE OR REPLACE FUNCTION public.get_visible_contact(_owner_id uuid)
RETURNS TABLE (phone text, email text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE WHEN public.can_view_contact(_owner_id, auth.uid(), 'phone') THEN p.phone_number ELSE NULL END,
    CASE WHEN public.can_view_contact(_owner_id, auth.uid(), 'email') THEN p.contact_email ELSE NULL END
  FROM public.profiles p WHERE p.id = _owner_id
$$;