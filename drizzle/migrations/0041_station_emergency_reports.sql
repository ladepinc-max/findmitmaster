CREATE TABLE public.emergency_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL,
  incident_type text NOT NULL,
  description text,
  media_path text,
  media_kind text CHECK (media_kind IN ('photo','video')),
  reporter_phone text,
  lat double precision,
  lng double precision,
  accuracy_m double precision,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','acknowledged','dispatched','resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX emergency_reports_shop_idx ON public.emergency_reports (shop_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.emergency_reports TO authenticated;
GRANT ALL ON public.emergency_reports TO service_role;
ALTER TABLE public.emergency_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reporters send reports" ON public.emergency_reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid() AND public.shop_is_active(shop_id) AND (media_path IS NULL OR media_path LIKE auth.uid()::text || '/%'));
CREATE POLICY "Reporters read own" ON public.emergency_reports FOR SELECT TO authenticated USING (reporter_id = auth.uid());
CREATE POLICY "Station reads reports" ON public.emergency_reports FOR SELECT TO authenticated USING (public.owns_shop(shop_id, auth.uid()));
CREATE POLICY "Station updates reports" ON public.emergency_reports FOR UPDATE TO authenticated USING (public.owns_shop(shop_id, auth.uid())) WITH CHECK (public.owns_shop(shop_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.guard_emergency_report_update() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.shop_id <> OLD.shop_id OR NEW.reporter_id <> OLD.reporter_id OR NEW.media_path IS DISTINCT FROM OLD.media_path
     OR NEW.description IS DISTINCT FROM OLD.description OR NEW.lat IS DISTINCT FROM OLD.lat OR NEW.lng IS DISTINCT FROM OLD.lng
     OR NEW.incident_type <> OLD.incident_type OR NEW.reporter_phone IS DISTINCT FROM OLD.reporter_phone THEN
    RAISE EXCEPTION 'Reports cannot be edited';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER emergency_reports_guard BEFORE UPDATE ON public.emergency_reports FOR EACH ROW EXECUTE FUNCTION public.guard_emergency_report_update();

ALTER PUBLICATION supabase_realtime ADD TABLE public.emergency_reports;

CREATE POLICY "Reporters upload evidence" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'emergency-evidence' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Reporters view own evidence" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'emergency-evidence' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Stations view evidence" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'emergency-evidence' AND EXISTS (
    SELECT 1 FROM public.emergency_reports r WHERE r.media_path = storage.objects.name AND public.owns_shop(r.shop_id, auth.uid())));