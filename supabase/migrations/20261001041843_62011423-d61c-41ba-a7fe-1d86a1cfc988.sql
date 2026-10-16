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
