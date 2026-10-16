ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS stream_uid text,
  ADD COLUMN IF NOT EXISTS hls_url text;