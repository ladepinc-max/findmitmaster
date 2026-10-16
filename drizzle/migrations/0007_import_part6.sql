ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_phone_to text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS show_email_to text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS contact_email text;

CREATE TABLE IF NOT EXISTS public.contact_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  allow_phone boolean NOT NULL DEFAULT true,
  allow_email boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (owner_id, viewer_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_permissions TO authenticated;
GRANT ALL ON public.contact_permissions TO service_role;

ALTER TABLE public.contact_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their contact permissions"
  ON public.contact_permissions FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Viewers can see permissions granted to them"
  ON public.contact_permissions FOR SELECT TO authenticated
  USING (auth.uid() = viewer_id);

CREATE TRIGGER contact_permissions_set_updated_at
  BEFORE UPDATE ON public.contact_permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.can_view_contact(_owner_id uuid, _viewer_id uuid, _field text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _owner_id = _viewer_id THEN true
    ELSE COALESCE((
      SELECT CASE
        WHEN (_field = 'phone' AND p.show_phone_to = 'public')
          OR (_field = 'email' AND p.show_email_to = 'public') THEN true
        WHEN (_field = 'phone' AND p.show_phone_to = 'friends')
          OR (_field = 'email' AND p.show_email_to = 'friends') THEN EXISTS (
            SELECT 1 FROM public.follows f1
            JOIN public.follows f2
              ON f2.follower_id = f1.following_id AND f2.following_id = f1.follower_id
            WHERE f1.follower_id = _owner_id AND f1.following_id = _viewer_id
          )
        ELSE false
      END
      FROM public.profiles p WHERE p.id = _owner_id
    ), false)
      OR EXISTS (
        SELECT 1 FROM public.contact_permissions cp
        WHERE cp.owner_id = _owner_id AND cp.viewer_id = _viewer_id
          AND ((_field = 'phone' AND cp.allow_phone) OR (_field = 'email' AND cp.allow_email))
      )
  END
$$;

CREATE OR REPLACE FUNCTION public.get_visible_contact(_owner_id uuid)
RETURNS TABLE (phone text, email text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE WHEN public.can_view_contact(_owner_id, auth.uid(), 'phone') THEN p.phone_number ELSE NULL END,
    CASE WHEN public.can_view_contact(_owner_id, auth.uid(), 'email') THEN p.contact_email ELSE NULL END
  FROM public.profiles p WHERE p.id = _owner_id
$$;
REVOKE ALL ON FUNCTION public.can_view_contact(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_visible_contact(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_visible_contact(uuid) TO authenticated;
CREATE TABLE IF NOT EXISTS public.phone_verifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone text NOT NULL,
  code text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  consumed boolean NOT NULL DEFAULT false,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS phone_verifications_phone_idx ON public.phone_verifications (phone, created_at DESC);

GRANT ALL ON public.phone_verifications TO service_role;

ALTER TABLE public.phone_verifications ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER phone_verifications_set_updated_at
  BEFORE UPDATE ON public.phone_verifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
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
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_classes;
CREATE TABLE public.tutor_chat_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'user',
  content text NOT NULL,
  web_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.tutor_chat_messages TO authenticated;
GRANT ALL ON public.tutor_chat_messages TO service_role;

ALTER TABLE public.tutor_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students read their own tutor chat"
  ON public.tutor_chat_messages FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Students add to their own tutor chat"
  ON public.tutor_chat_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Students clear their own tutor chat"
  ON public.tutor_chat_messages FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX tutor_chat_messages_user_created_idx
  ON public.tutor_chat_messages (user_id, created_at);
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE public.ges_vault_jhs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  grade text NOT NULL CHECK (grade IN ('B7','B8','B9')),
  strand text,
  sub_strand text,
  indicator text,
  content text NOT NULL,
  source_text text,
  source_type text NOT NULL DEFAULT 'syllabus' CHECK (source_type IN ('syllabus','bece_past_question','textbook')),
  embedding vector(1536),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ges_vault_jhs TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ges_vault_jhs TO authenticated;
GRANT ALL ON public.ges_vault_jhs TO service_role;

ALTER TABLE public.ges_vault_jhs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can read the vault"
  ON public.ges_vault_jhs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can add vault material"
  ON public.ges_vault_jhs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_super_admin());

CREATE POLICY "Admins can edit vault material"
  ON public.ges_vault_jhs FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin())
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_super_admin());

CREATE POLICY "Admins can remove vault material"
  ON public.ges_vault_jhs FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin());

CREATE TRIGGER ges_vault_jhs_updated_at
  BEFORE UPDATE ON public.ges_vault_jhs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX ges_vault_jhs_subject_grade_idx ON public.ges_vault_jhs (subject, grade);
CREATE INDEX ges_vault_jhs_source_type_idx ON public.ges_vault_jhs (source_type);
CREATE INDEX ges_vault_jhs_fts_idx ON public.ges_vault_jhs
  USING gin (to_tsvector('english', coalesce(indicator,'') || ' ' || coalesce(strand,'') || ' ' || coalesce(sub_strand,'') || ' ' || content));
CREATE INDEX ges_vault_jhs_embedding_idx ON public.ges_vault_jhs
  USING hnsw (embedding vector_cosine_ops);

CREATE OR REPLACE FUNCTION public.match_ges_vault_jhs(
  query_embedding vector(1536),
  query_text text DEFAULT '',
  match_grade text DEFAULT NULL,
  match_subject text DEFAULT NULL,
  match_count integer DEFAULT 3
)
RETURNS TABLE (
  id uuid,
  subject text,
  grade text,
  strand text,
  sub_strand text,
  indicator text,
  content text,
  source_text text,
  source_type text,
  similarity double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.id, v.subject, v.grade, v.strand, v.sub_strand, v.indicator,
         v.content, v.source_text, v.source_type,
         CASE
           WHEN query_embedding IS NULL OR v.embedding IS NULL
             THEN ts_rank(to_tsvector('english', coalesce(v.indicator,'') || ' ' || coalesce(v.strand,'') || ' ' || coalesce(v.sub_strand,'') || ' ' || v.content),
                          plainto_tsquery('english', coalesce(query_text,'')))::double precision
           ELSE (1 - (v.embedding <=> query_embedding))::double precision
         END AS similarity
  FROM public.ges_vault_jhs v
  WHERE (match_grade IS NULL OR v.grade = match_grade)
    AND (match_subject IS NULL OR v.subject ILIKE match_subject)
    AND (
      query_embedding IS NOT NULL AND v.embedding IS NOT NULL
      OR coalesce(query_text,'') = ''
      OR to_tsvector('english', coalesce(v.indicator,'') || ' ' || coalesce(v.strand,'') || ' ' || coalesce(v.sub_strand,'') || ' ' || v.content)
         @@ plainto_tsquery('english', query_text)
    )
  ORDER BY similarity DESC
  LIMIT greatest(1, least(coalesce(match_count,3), 10));
$$;

GRANT EXECUTE ON FUNCTION public.match_ges_vault_jhs(vector, text, text, text, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.match_ges_vault_jhs(vector, text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_ges_vault_jhs(vector, text, text, text, integer) TO authenticated, service_role;

CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION vector SET SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.match_ges_vault_jhs(
  query_embedding extensions.vector(1536),
  query_text text DEFAULT '',
  match_grade text DEFAULT NULL,
  match_subject text DEFAULT NULL,
  match_count integer DEFAULT 3
)
RETURNS TABLE (
  id uuid,
  subject text,
  grade text,
  strand text,
  sub_strand text,
  indicator text,
  content text,
  source_text text,
  source_type text,
  similarity double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  SELECT v.id, v.subject, v.grade, v.strand, v.sub_strand, v.indicator,
         v.content, v.source_text, v.source_type,
         CASE
           WHEN query_embedding IS NULL OR v.embedding IS NULL
             THEN ts_rank(to_tsvector('english', coalesce(v.indicator,'') || ' ' || coalesce(v.strand,'') || ' ' || coalesce(v.sub_strand,'') || ' ' || v.content),
                          plainto_tsquery('english', coalesce(query_text,'')))::double precision
           ELSE (1 - (v.embedding <=> query_embedding))::double precision
         END AS similarity
  FROM public.ges_vault_jhs v
  WHERE (match_grade IS NULL OR v.grade = match_grade)
    AND (match_subject IS NULL OR v.subject ILIKE match_subject)
    AND (
      query_embedding IS NOT NULL AND v.embedding IS NOT NULL
      OR coalesce(query_text,'') = ''
      OR to_tsvector('english', coalesce(v.indicator,'') || ' ' || coalesce(v.strand,'') || ' ' || coalesce(v.sub_strand,'') || ' ' || v.content)
         @@ plainto_tsquery('english', query_text)
    )
  ORDER BY similarity DESC
  LIMIT greatest(1, least(coalesce(match_count,3), 10));
$$;

REVOKE ALL ON FUNCTION public.match_ges_vault_jhs(extensions.vector, text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_ges_vault_jhs(extensions.vector, text, text, text, integer) TO authenticated, service_role;

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
