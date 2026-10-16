CREATE TABLE public.tutor_settings (
  id integer PRIMARY KEY DEFAULT 1,
  tutor_name text NOT NULL DEFAULT 'Ama',
  avatar_url text,
  greeting text NOT NULL DEFAULT 'Akwaaba! I be Ama, your WASSCE tutor. Make we learn together.',
  language text NOT NULL DEFAULT 'english',
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tutor_settings TO anon;
GRANT SELECT, INSERT, UPDATE ON public.tutor_settings TO authenticated;
GRANT ALL ON public.tutor_settings TO service_role;
ALTER TABLE public.tutor_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tutor_settings_read" ON public.tutor_settings FOR SELECT USING (true);
CREATE POLICY "tutor_settings_admin_insert" ON public.tutor_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "tutor_settings_admin_update" ON public.tutor_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.tutor_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.wassce_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  topic text NOT NULL,
  year integer,
  question_text text NOT NULL,
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  correct_answer text NOT NULL,
  explanation text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'past',
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX wassce_questions_subject_topic_idx ON public.wassce_questions (subject, topic);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wassce_questions TO authenticated;
GRANT ALL ON public.wassce_questions TO service_role;
ALTER TABLE public.wassce_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wassce_questions_read" ON public.wassce_questions FOR SELECT TO authenticated USING (true);
CREATE POLICY "wassce_questions_staff_insert" ON public.wassce_questions FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "wassce_questions_staff_update" ON public.wassce_questions FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher')) WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "wassce_questions_admin_delete" ON public.wassce_questions FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.wassce_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  question_id uuid REFERENCES public.wassce_questions ON DELETE SET NULL,
  subject text NOT NULL,
  topic text NOT NULL DEFAULT '',
  selected_option text NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  time_taken_seconds integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX wassce_attempts_user_idx ON public.wassce_attempts (user_id, created_at DESC);
GRANT SELECT, INSERT ON public.wassce_attempts TO authenticated;
GRANT ALL ON public.wassce_attempts TO service_role;
ALTER TABLE public.wassce_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wassce_attempts_own_read" ON public.wassce_attempts FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "wassce_attempts_own_insert" ON public.wassce_attempts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.class_understanding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid REFERENCES public.live_classes ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  topic text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'understood',
  followup_score integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX class_understanding_class_idx ON public.class_understanding (class_id);
GRANT SELECT, INSERT, UPDATE ON public.class_understanding TO authenticated;
GRANT ALL ON public.class_understanding TO service_role;
ALTER TABLE public.class_understanding ENABLE ROW LEVEL SECURITY;
CREATE POLICY "class_understanding_read" ON public.class_understanding FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "class_understanding_own_insert" ON public.class_understanding FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "class_understanding_own_update" ON public.class_understanding FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.tutor_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 20,
  currency text NOT NULL DEFAULT 'GHS',
  reference text,
  status text NOT NULL DEFAULT 'active',
  expires_at timestamp with time zone NOT NULL DEFAULT now() + interval '30 days',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX tutor_subscriptions_user_idx ON public.tutor_subscriptions (user_id, expires_at DESC);
GRANT SELECT, INSERT ON public.tutor_subscriptions TO authenticated;
GRANT ALL ON public.tutor_subscriptions TO service_role;
ALTER TABLE public.tutor_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tutor_subscriptions_own_read" ON public.tutor_subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "tutor_subscriptions_own_insert" ON public.tutor_subscriptions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER wassce_questions_updated_at BEFORE UPDATE ON public.wassce_questions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER class_understanding_updated_at BEFORE UPDATE ON public.class_understanding FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();