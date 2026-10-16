ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS payment_momo_number text,
  ADD COLUMN IF NOT EXISTS payment_momo_provider text;