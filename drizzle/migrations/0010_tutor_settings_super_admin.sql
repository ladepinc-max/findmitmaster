DROP POLICY IF EXISTS tutor_settings_admin_update ON public.tutor_settings;
CREATE POLICY tutor_settings_admin_update ON public.tutor_settings FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin())
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_super_admin());
DROP POLICY IF EXISTS tutor_settings_admin_insert ON public.tutor_settings;
CREATE POLICY tutor_settings_admin_insert ON public.tutor_settings FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_super_admin());
DROP POLICY IF EXISTS "Admins manage tutor subjects" ON public.tutor_subjects;
CREATE POLICY "Admins manage tutor subjects" ON public.tutor_subjects FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin())
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_super_admin());