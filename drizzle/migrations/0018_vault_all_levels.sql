ALTER TABLE public.ges_vault_jhs ADD COLUMN IF NOT EXISTS level text NOT NULL DEFAULT 'jhs';
ALTER TABLE public.ges_vault_jhs DROP CONSTRAINT IF EXISTS ges_vault_jhs_grade_check;
ALTER TABLE public.ges_vault_jhs DROP CONSTRAINT IF EXISTS ges_vault_jhs_source_type_check;
ALTER TABLE public.ges_vault_jhs ADD CONSTRAINT ges_vault_level_check CHECK (level IN ('kids','basic','jhs','shs','tertiary'));
ALTER TABLE public.ges_vault_jhs ADD CONSTRAINT ges_vault_source_type_check CHECK (source_type IN ('syllabus','bece_past_question','textbook','past_question'));
CREATE INDEX IF NOT EXISTS ges_vault_level_idx ON public.ges_vault_jhs (level, grade);

-- Vault rows are read only by admins directly; students reach them through the search function.
DROP POLICY IF EXISTS "Signed-in users can read the vault" ON public.ges_vault_jhs;
CREATE POLICY "Admins can read vault material"
  ON public.ges_vault_jhs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin());

CREATE OR REPLACE FUNCTION public.match_vault(
  query_embedding extensions.vector(1536),
  query_text text DEFAULT '',
  match_level text DEFAULT 'jhs',
  match_grade text DEFAULT NULL,
  match_count integer DEFAULT 3
)
RETURNS TABLE (id uuid, level text, subject text, grade text, strand text, sub_strand text, indicator text,
  content text, source_text text, source_type text, similarity double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
  SELECT v.id, v.level, v.subject, v.grade, v.strand, v.sub_strand, v.indicator, v.content, v.source_text, v.source_type,
    CASE WHEN query_embedding IS NULL OR v.embedding IS NULL
      THEN ts_rank(to_tsvector('english', coalesce(v.indicator,'') || ' ' || coalesce(v.strand,'') || ' ' || coalesce(v.sub_strand,'') || ' ' || v.content),
                   plainto_tsquery('english', coalesce(query_text,'')))::double precision
      ELSE (1 - (v.embedding <=> query_embedding))::double precision END AS similarity
  FROM public.ges_vault_jhs v
  WHERE v.level = match_level
    AND (match_grade IS NULL OR v.grade = match_grade OR v.grade = 'ALL')
    AND (
      query_embedding IS NOT NULL AND v.embedding IS NOT NULL
      OR to_tsvector('english', coalesce(v.indicator,'') || ' ' || coalesce(v.strand,'') || ' ' || coalesce(v.sub_strand,'') || ' ' || v.content)
         @@ plainto_tsquery('english', coalesce(query_text,''))
    )
  ORDER BY similarity DESC
  LIMIT greatest(1, least(match_count, 8));
$$;
REVOKE ALL ON FUNCTION public.match_vault(extensions.vector, text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_vault(extensions.vector, text, text, text, integer) TO authenticated, service_role;