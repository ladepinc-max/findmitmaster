CREATE TABLE public.tutor_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL,
  name text NOT NULL,
  topics text[] NOT NULL DEFAULT '{}',
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (level, name)
);
GRANT SELECT ON public.tutor_subjects TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tutor_subjects TO authenticated;
GRANT ALL ON public.tutor_subjects TO service_role;
ALTER TABLE public.tutor_subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view tutor subjects" ON public.tutor_subjects FOR SELECT USING (true);
CREATE POLICY "Admins manage tutor subjects" ON public.tutor_subjects FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));