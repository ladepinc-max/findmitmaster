CREATE TABLE public.crawled_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'global_reference',
  source_name text NOT NULL DEFAULT '',
  source_url text NOT NULL UNIQUE,
  image_url text,
  is_evergreen boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  crawled_at timestamptz NOT NULL DEFAULT now(),
  tsv tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(summary,'')), 'B') ||
    setweight(to_tsvector('english', left(coalesce(content,''), 20000)), 'C')
  ) STORED
);
CREATE INDEX crawled_knowledge_tsv_idx ON public.crawled_knowledge USING gin (tsv);
CREATE INDEX crawled_knowledge_expires_idx ON public.crawled_knowledge (expires_at);
GRANT SELECT ON public.crawled_knowledge TO anon, authenticated;
GRANT ALL ON public.crawled_knowledge TO service_role;
ALTER TABLE public.crawled_knowledge ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read live knowledge" ON public.crawled_knowledge
  FOR SELECT TO anon, authenticated USING (expires_at IS NULL OR expires_at > now());
CREATE POLICY "Super admins manage knowledge" ON public.crawled_knowledge
  FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE OR REPLACE FUNCTION public.search_knowledge(_q text, _n integer DEFAULT 5)
RETURNS TABLE(id uuid, title text, summary text, content text, category text, source_name text, source_url text, image_url text, rank real)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT k.id, k.title, k.summary, k.content, k.category, k.source_name, k.source_url, k.image_url,
         ts_rank(k.tsv, q) AS rank
  FROM public.crawled_knowledge k, websearch_to_tsquery('english', _q) q
  WHERE k.tsv @@ q AND (k.expires_at IS NULL OR k.expires_at > now())
  ORDER BY rank DESC LIMIT least(greatest(_n,1),20)
$$;
GRANT EXECUTE ON FUNCTION public.search_knowledge(text, integer) TO anon, authenticated, service_role;