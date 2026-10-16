CREATE TABLE IF NOT EXISTS public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  topic text not null default '',
  is_live boolean not null default true,
  viewer_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_sessions TO authenticated;
GRANT SELECT ON public.live_sessions TO anon;
GRANT ALL ON public.live_sessions TO service_role;

ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "live_sessions_select" ON public.live_sessions FOR SELECT USING (true);
CREATE POLICY "live_sessions_insert_own" ON public.live_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = host_id);
CREATE POLICY "live_sessions_update" ON public.live_sessions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "live_sessions_delete_own" ON public.live_sessions FOR DELETE TO authenticated USING (auth.uid() = host_id);

CREATE TABLE IF NOT EXISTS public.live_signals (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  from_id uuid not null references public.profiles(id) on delete cascade,
  to_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('offer','answer','ice')),
  data jsonb not null,
  created_at timestamptz not null default now()
);

GRANT SELECT, INSERT, DELETE ON public.live_signals TO authenticated;
GRANT ALL ON public.live_signals TO service_role;

ALTER TABLE public.live_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "live_signals_select_party" ON public.live_signals FOR SELECT TO authenticated USING (auth.uid() = from_id OR auth.uid() = to_id);
CREATE POLICY "live_signals_insert_self" ON public.live_signals FOR INSERT TO authenticated WITH CHECK (auth.uid() = from_id);
CREATE POLICY "live_signals_delete_party" ON public.live_signals FOR DELETE TO authenticated USING (auth.uid() = from_id OR auth.uid() = to_id);

CREATE INDEX IF NOT EXISTS live_signals_to_idx ON public.live_signals (to_id, created_at DESC);
CREATE INDEX IF NOT EXISTS live_sessions_live_idx ON public.live_sessions (is_live, created_at DESC);

CREATE TRIGGER live_sessions_set_updated_at BEFORE UPDATE ON public.live_sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.live_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_signals;