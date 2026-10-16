CREATE TABLE public.job_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Job alert',
  keywords text NOT NULL DEFAULT '',
  skills text[] NOT NULL DEFAULT '{}',
  category text,
  job_type text,
  min_salary numeric,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_alerts TO authenticated;
GRANT ALL ON public.job_alerts TO service_role;
ALTER TABLE public.job_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own alerts select" ON public.job_alerts FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own alerts insert" ON public.job_alerts FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own alerts update" ON public.job_alerts FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own alerts delete" ON public.job_alerts FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER job_alerts_set_updated_at BEFORE UPDATE ON public.job_alerts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.job_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  alert_id uuid REFERENCES public.job_alerts(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX job_notifications_unique ON public.job_notifications (user_id, job_id, alert_id);
CREATE INDEX job_notifications_user_idx ON public.job_notifications (user_id, created_at DESC);
GRANT SELECT, UPDATE, DELETE ON public.job_notifications TO authenticated;
GRANT ALL ON public.job_notifications TO service_role;
ALTER TABLE public.job_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notifications select" ON public.job_notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own notifications update" ON public.job_notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own notifications delete" ON public.job_notifications FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.fanout_job_alerts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  a RECORD;
  hay text;
BEGIN
  hay := lower(coalesce(NEW.title,'') || ' ' || coalesce(NEW.company,'') || ' ' || coalesce(NEW.description,'') || ' ' || coalesce(NEW.category,'') || ' ' || array_to_string(coalesce(NEW.skills,'{}'), ' '));
  FOR a IN
    SELECT * FROM public.job_alerts
    WHERE is_active = true AND user_id <> NEW.employer_id
  LOOP
    CONTINUE WHEN a.category IS NOT NULL AND a.category <> '' AND lower(a.category) <> lower(coalesce(NEW.category,''));
    CONTINUE WHEN a.job_type IS NOT NULL AND a.job_type <> '' AND lower(a.job_type) <> lower(coalesce(NEW.job_type,''));
    CONTINUE WHEN a.min_salary IS NOT NULL AND coalesce(NEW.salary_amount, 0) < a.min_salary;
    CONTINUE WHEN a.keywords <> '' AND position(lower(a.keywords) in hay) = 0;
    CONTINUE WHEN array_length(a.skills, 1) IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM unnest(a.skills) s WHERE position(lower(s) in hay) > 0
    );
    INSERT INTO public.job_notifications (user_id, alert_id, job_id, title, body)
    VALUES (a.user_id, a.id, NEW.id, 'New job: ' || NEW.title, NEW.company || ' · ' || NEW.location_name)
    ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE TRIGGER jobs_fanout_alerts AFTER INSERT ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.fanout_job_alerts();