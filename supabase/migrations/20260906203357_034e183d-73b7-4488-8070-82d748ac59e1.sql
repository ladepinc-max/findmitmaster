
-- roles
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','moderator','user','teacher');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- profile verification
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS completed_projects integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS skill_score integer NOT NULL DEFAULT 0;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_verification_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_verification_status_check
  CHECK (verification_status IN ('none','pending','verified'));

-- job/company verification
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS company_verification_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS meets_requirements boolean NOT NULL DEFAULT false;
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_company_verification_status_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_company_verification_status_check
  CHECK (company_verification_status IN ('none','pending','verified'));
CREATE INDEX IF NOT EXISTS jobs_company_verification_idx ON public.jobs (company_verification_status);
CREATE INDEX IF NOT EXISTS profiles_verification_idx ON public.profiles (verification_status);

-- talent verification applications
CREATE TABLE public.talent_verification_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cv_path text,
  projects text not null default '',
  reason text not null default '',
  fee_reference text,
  status text not null default 'pending',
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  CONSTRAINT talent_verification_status_check CHECK (status IN ('pending','approved','rejected'))
);
GRANT SELECT, INSERT, UPDATE ON public.talent_verification_applications TO authenticated;
GRANT ALL ON public.talent_verification_applications TO service_role;
ALTER TABLE public.talent_verification_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own talent applications read" ON public.talent_verification_applications
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "own talent applications insert" ON public.talent_verification_applications
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admin talent applications update" ON public.talent_verification_applications
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- company verification applications
CREATE TABLE public.company_verification_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_name text not null,
  tin text not null,
  ssnit_proof_path text,
  insurance_policy_path text,
  documents_paths text[] not null default '{}',
  salary_min numeric,
  salary_max numeric,
  status text not null default 'pending',
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  CONSTRAINT company_verification_status_check CHECK (status IN ('pending','approved','rejected'))
);
GRANT SELECT, INSERT, UPDATE ON public.company_verification_applications TO authenticated;
GRANT ALL ON public.company_verification_applications TO service_role;
ALTER TABLE public.company_verification_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own company applications read" ON public.company_verification_applications
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "own company applications insert" ON public.company_verification_applications
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admin company applications update" ON public.company_verification_applications
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER talent_verification_set_updated_at BEFORE UPDATE ON public.talent_verification_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER company_verification_set_updated_at BEFORE UPDATE ON public.company_verification_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- admins may flip verification states
CREATE POLICY "Admins update any profile verification" ON public.profiles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update any job verification" ON public.jobs
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
