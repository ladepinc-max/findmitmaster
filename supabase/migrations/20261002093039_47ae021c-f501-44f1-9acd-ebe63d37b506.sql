DROP POLICY IF EXISTS "Admins can delete any job" ON public.jobs;
CREATE POLICY "Admins can delete any job" ON public.jobs FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin());
DROP POLICY IF EXISTS "Admins can delete any expertise" ON public.talent_profiles;
CREATE POLICY "Admins can delete any expertise" ON public.talent_profiles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin());