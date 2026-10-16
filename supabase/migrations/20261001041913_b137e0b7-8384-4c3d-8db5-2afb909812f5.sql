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
