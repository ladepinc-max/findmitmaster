ALTER TABLE public.tutor_settings
  ADD COLUMN IF NOT EXISTS voice_rate numeric NOT NULL DEFAULT 0.9,
  ADD COLUMN IF NOT EXISTS voice_pitch numeric NOT NULL DEFAULT 1.02,
  ADD COLUMN IF NOT EXISTS voice_volume numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS voice_cadence text NOT NULL DEFAULT 'relaxed',
  ADD COLUMN IF NOT EXISTS voice_phonetics boolean NOT NULL DEFAULT true;