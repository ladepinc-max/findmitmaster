ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS is_open boolean NOT NULL DEFAULT true;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS views_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS opening_hours text;

CREATE OR REPLACE FUNCTION public.increment_shop_view(_shop_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.shops SET views_count = views_count + 1
  WHERE id = _shop_id AND owner_id IS DISTINCT FROM auth.uid() AND public.shop_is_active(_shop_id);
$$;
GRANT EXECUTE ON FUNCTION public.increment_shop_view(uuid) TO anon, authenticated;