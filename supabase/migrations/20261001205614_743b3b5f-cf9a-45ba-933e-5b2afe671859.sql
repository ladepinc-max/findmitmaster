CREATE TABLE public.user_free_access (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  granted_by uuid,
  classroom_raise boolean NOT NULL DEFAULT false,
  jobs_contact boolean NOT NULL DEFAULT false,
  jobs_post boolean NOT NULL DEFAULT false,
  talent_post boolean NOT NULL DEFAULT false,
  tutor_unlimited boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_free_access TO authenticated;
GRANT ALL ON public.user_free_access TO service_role;
ALTER TABLE public.user_free_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own free access" ON public.user_free_access FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.is_super_admin());
CREATE POLICY "Admins manage free access" ON public.user_free_access FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin())
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_super_admin());
CREATE TRIGGER user_free_access_updated_at BEFORE UPDATE ON public.user_free_access
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();