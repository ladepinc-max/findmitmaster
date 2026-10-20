ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS bg_photo_url text;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS bg_opacity real NOT NULL DEFAULT 0.2;