-- Replace the super-admin-only write policies with admin-or-super-admin versions
DROP POLICY IF EXISTS "Super admin can insert partner tvs" ON public.partner_tvs;
DROP POLICY IF EXISTS "Super admin can update partner tvs" ON public.partner_tvs;
DROP POLICY IF EXISTS "Super admin can delete partner tvs" ON public.partner_tvs;

CREATE POLICY "Admins can insert partner tvs" ON public.partner_tvs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update partner tvs" ON public.partner_tvs
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_super_admin() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete partner tvs" ON public.partner_tvs
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR public.has_role(auth.uid(), 'admin'));
