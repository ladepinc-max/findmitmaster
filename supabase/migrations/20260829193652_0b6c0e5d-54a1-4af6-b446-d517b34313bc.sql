CREATE TABLE public.live_classes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  host_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  topic text NOT NULL,
  description text NOT NULL DEFAULT '',
  thumbnail_path text,
  is_live boolean NOT NULL DEFAULT true,
  viewers_count integer NOT NULL DEFAULT 0,
  room_name text NOT NULL,
  hls_url text,
  practical_price numeric NOT NULL DEFAULT 20,
  practical_currency text NOT NULL DEFAULT 'GHS',
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  ended_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.live_classes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_classes TO authenticated;
GRANT ALL ON public.live_classes TO service_role;

ALTER TABLE public.live_classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Live classes are viewable by everyone"
  ON public.live_classes FOR SELECT
  USING (true);

CREATE POLICY "Hosts can create their own live classes"
  ON public.live_classes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Hosts can update their own live classes"
  ON public.live_classes FOR UPDATE TO authenticated
  USING (auth.uid() = host_id) WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Hosts can delete their own live classes"
  ON public.live_classes FOR DELETE TO authenticated
  USING (auth.uid() = host_id);

CREATE INDEX live_classes_live_idx ON public.live_classes (is_live, started_at DESC);

CREATE TRIGGER set_live_classes_updated_at
  BEFORE UPDATE ON public.live_classes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();