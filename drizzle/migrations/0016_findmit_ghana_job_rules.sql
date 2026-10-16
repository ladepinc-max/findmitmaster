CREATE OR REPLACE FUNCTION public.tag_verified_company_job()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM company_verification_applications WHERE user_id = NEW.employer_id AND status = 'approved') THEN
    NEW.company_verification_status := 'verified';
    NEW.meets_requirements := true;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS jobs_tag_verified_company ON public.jobs;
CREATE TRIGGER jobs_tag_verified_company BEFORE INSERT ON public.jobs
FOR EACH ROW EXECUTE FUNCTION public.tag_verified_company_job();

CREATE OR REPLACE FUNCTION public.guard_findmit_ghana_application()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.job_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM jobs WHERE id = NEW.job_id AND company_verification_status = 'verified')
     AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = NEW.employee_id AND verification_status = 'verified') THEN
    RAISE EXCEPTION 'Only FindMit graduates can apply to FindMit Ghana jobs';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS job_applications_ghana_guard ON public.job_applications;
CREATE TRIGGER job_applications_ghana_guard BEFORE INSERT ON public.job_applications
FOR EACH ROW EXECUTE FUNCTION public.guard_findmit_ghana_application();