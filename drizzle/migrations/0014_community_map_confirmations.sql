ALTER TABLE public.community_names ADD COLUMN IF NOT EXISTS landmark text;
ALTER TABLE public.community_names ADD COLUMN IF NOT EXISTS plus_code text;

CREATE TABLE public.community_name_confirmations (
  community_id uuid NOT NULL REFERENCES public.community_names(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id)
);
GRANT SELECT ON public.community_name_confirmations TO authenticated;
GRANT ALL ON public.community_name_confirmations TO service_role;
ALTER TABLE public.community_name_confirmations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own name confirmations" ON public.community_name_confirmations FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.route_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES public.verified_routes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  correct boolean NOT NULL,
  note text,
  lat double precision,
  lng double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (route_id, user_id)
);
GRANT SELECT ON public.route_feedback TO authenticated;
GRANT ALL ON public.route_feedback TO service_role;
ALTER TABLE public.route_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own route feedback" ON public.route_feedback FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.confirm_community_name(_id uuid, _photo text, _voice text)
RETURNS TABLE(verified boolean, confirmations integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _n integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF EXISTS (SELECT 1 FROM community_names WHERE id = _id AND submitted_by = _uid)
     OR EXISTS (SELECT 1 FROM community_name_confirmations WHERE community_id = _id AND user_id = _uid) THEN
    SELECT c.verified, c.times_confirmed INTO verified, confirmations FROM community_names c WHERE c.id = _id;
    RETURN NEXT; RETURN;
  END IF;
  INSERT INTO community_name_confirmations(community_id, user_id) VALUES (_id, _uid);
  UPDATE community_names SET times_confirmed = COALESCE(times_confirmed,1) + 1,
    verified = COALESCE(times_confirmed,1) + 1 >= 3,
    photo_url = COALESCE(photo_url, _photo),
    voice_note_url = COALESCE(voice_note_url, _voice)
  WHERE id = _id RETURNING community_names.verified, community_names.times_confirmed INTO verified, confirmations;
  RETURN NEXT;
END $$;
GRANT EXECUTE ON FUNCTION public.confirm_community_name(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.nearby_pending_routes(_lat double precision, _lng double precision)
RETURNS TABLE(id uuid, start_lat double precision, start_lng double precision, end_lat double precision, end_lng double precision, distance_km numeric, builder_name text, trace jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.start_lat, r.start_lng, r.end_lat, r.end_lng, r.distance_km::numeric, r.builder_name, r.trace
  FROM verified_routes r
  WHERE r.status = 'pending' AND r.created_by <> auth.uid()
    AND abs(r.start_lat - _lat) < 0.03 AND abs(r.start_lng - _lng) < 0.03
    AND NOT EXISTS (SELECT 1 FROM route_feedback f WHERE f.route_id = r.id AND f.user_id = auth.uid())
  ORDER BY r.created_at DESC LIMIT 20
$$;
GRANT EXECUTE ON FUNCTION public.nearby_pending_routes(double precision, double precision) TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_route(_route_id uuid, _correct boolean, _note text, _lat double precision, _lng double precision)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _owner uuid; _status text; _yes int; _no int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT created_by, status INTO _owner, _status FROM verified_routes WHERE id = _route_id;
  IF _owner IS NULL THEN RAISE EXCEPTION 'Road not found'; END IF;
  IF _owner = _uid THEN RAISE EXCEPTION 'You cannot confirm your own road'; END IF;
  INSERT INTO route_feedback(route_id, user_id, correct, note, lat, lng)
  VALUES (_route_id, _uid, _correct, left(_note, 300), _lat, _lng)
  ON CONFLICT (route_id, user_id) DO UPDATE SET correct = EXCLUDED.correct, note = EXCLUDED.note;
  SELECT count(*) FILTER (WHERE correct), count(*) FILTER (WHERE NOT correct) INTO _yes, _no FROM route_feedback WHERE route_id = _route_id;
  IF _status = 'pending' AND _yes >= 2 THEN
    UPDATE verified_routes SET status = 'verified' WHERE id = _route_id;
    UPDATE road_builders SET verified_routes = COALESCE(verified_routes,0) + 1, trust_score = COALESCE(trust_score,0) + 1 WHERE user_id = _owner;
    _status := 'verified';
  ELSIF _no >= 3 AND _no > _yes THEN
    UPDATE verified_routes SET status = 'rejected' WHERE id = _route_id;
    _status := 'rejected';
  END IF;
  IF _status = 'verified' AND _correct THEN
    UPDATE verified_routes SET times_used = COALESCE(times_used,0) + 1 WHERE id = _route_id;
    UPDATE road_builders SET impact_count = COALESCE(impact_count,0) + 1 WHERE user_id = _owner;
  END IF;
  RETURN _status;
END $$;
GRANT EXECUTE ON FUNCTION public.confirm_route(uuid, boolean, text, double precision, double precision) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_route_spam() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT count(*) FROM verified_routes
      WHERE created_by = NEW.created_by AND created_at > now() - interval '5 minutes'
        AND abs(start_lat - NEW.start_lat) < 0.002 AND abs(start_lng - NEW.start_lng) < 0.002) >= 10 THEN
    RAISE EXCEPTION 'Too many roads from the same spot. Please wait a few minutes.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_route_spam ON public.verified_routes;
CREATE TRIGGER trg_guard_route_spam BEFORE INSERT ON public.verified_routes FOR EACH ROW EXECUTE FUNCTION public.guard_route_spam();