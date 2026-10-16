ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS tv_order integer;
ALTER TABLE public.tv_channels ADD COLUMN IF NOT EXISTS scheduled_start timestamptz;
CREATE INDEX IF NOT EXISTS posts_tv_category_order_idx ON public.posts (tv_category, tv_order);