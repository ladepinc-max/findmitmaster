CREATE TABLE public.verified_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  start_lat double precision NOT NULL,
  start_lng double precision NOT NULL,
  end_lat double precision NOT NULL,
  end_lng double precision NOT NULL,
  trace jsonb NOT NULL DEFAULT '[]'::jsonb,
  distance_km double precision,
  times_used integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  builder_name text,
  trust_score integer NOT NULL DEFAULT 0,
  source_route_id uuid REFERENCES public.verified_routes(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.verified_routes TO anon;
GRANT SELECT, INSERT, UPDATE ON public.verified_routes TO authenticated;
GRANT ALL ON public.verified_routes TO service_role;
ALTER TABLE public.verified_routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read verified routes" ON public.verified_routes FOR SELECT TO anon, authenticated USING (status = 'verified' OR created_by = auth.uid());
CREATE POLICY "Users insert own routes" ON public.verified_routes FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Users update own routes" ON public.verified_routes FOR UPDATE TO authenticated USING (created_by = auth.uid());

CREATE TABLE public.gps_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id uuid NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  accuracy double precision,
  speed double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.gps_traces TO authenticated;
GRANT ALL ON public.gps_traces TO service_role;
ALTER TABLE public.gps_traces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users insert own traces" ON public.gps_traces FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users read own traces" ON public.gps_traces FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.road_builders (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  phone text,
  areas_known text,
  total_routes integer NOT NULL DEFAULT 0,
  verified_routes integer NOT NULL DEFAULT 0,
  trust_score integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  volunteer_badge text,
  impact_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.road_builders TO anon;
GRANT SELECT, INSERT, UPDATE ON public.road_builders TO authenticated;
GRANT ALL ON public.road_builders TO service_role;
ALTER TABLE public.road_builders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read builders" ON public.road_builders FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Users insert own builder row" ON public.road_builders FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own builder row" ON public.road_builders FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.community_names (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  community_name text NOT NULL,
  district text,
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  photo_url text,
  voice_note_url text,
  transcription text,
  language_detected text,
  verified boolean NOT NULL DEFAULT false,
  times_confirmed integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.community_names TO anon;
GRANT SELECT, INSERT, UPDATE ON public.community_names TO authenticated;
GRANT ALL ON public.community_names TO service_role;
ALTER TABLE public.community_names ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read community names" ON public.community_names FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Users submit community names" ON public.community_names FOR INSERT TO authenticated WITH CHECK (submitted_by = auth.uid());
CREATE POLICY "Submitters update own names" ON public.community_names FOR UPDATE TO authenticated USING (submitted_by = auth.uid());

CREATE TABLE public.start_point_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id uuid,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  photo_url text,
  accuracy double precision,
  community_name text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.start_point_photos TO anon;
GRANT SELECT, INSERT ON public.start_point_photos TO authenticated;
GRANT ALL ON public.start_point_photos TO service_role;
ALTER TABLE public.start_point_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read start photos" ON public.start_point_photos FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Users insert own start photos" ON public.start_point_photos FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

CREATE INDEX verified_routes_start_idx ON public.verified_routes (start_lat, start_lng);
CREATE INDEX verified_routes_end_idx ON public.verified_routes (end_lat, end_lng);
CREATE INDEX gps_traces_journey_idx ON public.gps_traces (journey_id);
CREATE INDEX community_names_loc_idx ON public.community_names (lat, lng);