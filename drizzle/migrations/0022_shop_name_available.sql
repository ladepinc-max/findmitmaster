CREATE OR REPLACE FUNCTION public.is_shop_name_available(_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.shops WHERE lower(trim(name)) = lower(trim(_name)));
$$;
GRANT EXECUTE ON FUNCTION public.is_shop_name_available(text) TO anon, authenticated;