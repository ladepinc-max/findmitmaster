CREATE TABLE public.app_pricing (key text PRIMARY KEY, label text NOT NULL, amount integer NOT NULL CHECK (amount >= 0), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.app_pricing TO anon, authenticated;
GRANT UPDATE ON public.app_pricing TO authenticated;
GRANT ALL ON public.app_pricing TO service_role;
ALTER TABLE public.app_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read prices" ON public.app_pricing FOR SELECT USING (true);
CREATE POLICY "Admins update prices" ON public.app_pricing FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin())
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_super_admin());
CREATE TRIGGER app_pricing_updated BEFORE UPDATE ON public.app_pricing FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.app_pricing (key,label,amount) VALUES
 ('classroom_raise','Classroom Raise Hand',20),('job_post','Job Post',50),('job_apply','Job Apply',10);