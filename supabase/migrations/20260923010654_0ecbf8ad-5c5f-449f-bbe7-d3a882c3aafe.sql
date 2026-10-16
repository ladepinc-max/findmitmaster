CREATE TABLE public.teacher_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  age integer not null,
  current_school text not null,
  ghana_card_front_url text not null,
  ghana_card_back_url text not null,
  personal_contact text not null,
  hod_contact text not null,
  facial_verification_url text not null,
  match_score numeric not null default 0,
  status text not null default 'pending',
  reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE ON public.teacher_applications TO authenticated;
GRANT ALL ON public.teacher_applications TO service_role;

ALTER TABLE public.teacher_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own teacher application"
ON public.teacher_applications FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users read own teacher application"
ON public.teacher_applications FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update teacher applications"
ON public.teacher_applications FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER teacher_applications_updated_at
BEFORE UPDATE ON public.teacher_applications
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX teacher_applications_status_idx ON public.teacher_applications (status, created_at DESC);

-- Admins may grant roles (e.g. promote an approved applicant to teacher)
CREATE POLICY "Admins manage user roles"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete user roles"
ON public.user_roles FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Private storage buckets policies
CREATE POLICY "Users manage own verification uploads"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id IN ('ghana-cards','facial-verification') AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users read own verification uploads"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id IN ('ghana-cards','facial-verification') AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin')));