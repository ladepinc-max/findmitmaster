ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS tv_category text CHECK (tv_category IS NULL OR tv_category IN ('shs','jhs','primary','vocational','kids')),
  ADD COLUMN IF NOT EXISTS tv_type text CHECK (tv_type IS NULL OR tv_type IN ('live','on_demand'));

CREATE INDEX IF NOT EXISTS idx_posts_tv_category_published
  ON public.posts (tv_category, created_at DESC)
  WHERE status = 'published' AND tv_category IS NOT NULL;