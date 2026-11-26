ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'gh' CHECK (origin IN ('gh','intl'));

CREATE OR REPLACE FUNCTION public.supplier_origin_from_gps()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
    NEW.origin := CASE WHEN NEW.lat BETWEEN 4.5 AND 11.2 AND NEW.lng BETWEEN -3.3 AND 1.25 THEN 'gh' ELSE 'intl' END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS supplier_origin_from_gps ON public.suppliers;
CREATE TRIGGER supplier_origin_from_gps BEFORE INSERT OR UPDATE ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION public.supplier_origin_from_gps();

UPDATE public.suppliers SET origin = CASE WHEN lat BETWEEN 4.5 AND 11.2 AND lng BETWEEN -3.3 AND 1.25 THEN 'gh' ELSE 'intl' END WHERE lat IS NOT NULL AND lng IS NOT NULL;

INSERT INTO public.app_pricing (key, label, amount) VALUES
 ('supplier_registration_gh', 'Supplier registration — Ghana (GH¢ / year)', 2500),
 ('supplier_registration_intl', 'Supplier registration — International (USD / year)', 600)
ON CONFLICT (key) DO NOTHING;