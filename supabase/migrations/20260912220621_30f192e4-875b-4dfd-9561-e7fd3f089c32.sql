CREATE TABLE public.tv_channels (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL UNIQUE,
  host_id uuid REFERENCES auth.users ON DELETE SET NULL,
  subject text NOT NULL DEFAULT '',
  started_at timestamptz,
  total_seconds numeric NOT NULL DEFAULT 0,
  viewers_seed integer NOT NULL DEFAULT 12400,
  is_live boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tv_channels TO anon;
GRANT SELECT, INSERT, UPDATE ON public.tv_channels TO authenticated;
GRANT ALL ON public.tv_channels TO service_role;

ALTER TABLE public.tv_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view tv channels" ON public.tv_channels FOR SELECT USING (true);
CREATE POLICY "Authenticated can start broadcasts" ON public.tv_channels FOR INSERT TO authenticated WITH CHECK (auth.uid() = host_id);
CREATE POLICY "Authenticated can update broadcasts" ON public.tv_channels FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE TRIGGER tv_channels_set_updated_at BEFORE UPDATE ON public.tv_channels FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.tv_channels;