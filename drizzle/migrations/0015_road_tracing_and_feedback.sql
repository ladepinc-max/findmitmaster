ALTER TABLE public.verified_routes
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'walked',
  ADD COLUMN IF NOT EXISTS path_type text NOT NULL DEFAULT 'footpath',
  ADD COLUMN IF NOT EXISTS motorable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS local_name text,
  ADD COLUMN IF NOT EXISTS helpful_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unhelpful_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_decision text;

ALTER TABLE public.route_feedback
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS photo_path text;

CREATE OR REPLACE FUNCTION public.report_route(_route_id uuid, _helpful boolean, _reason text, _note text, _photo text, _lat double precision, _lng double precision)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _owner uuid; _status text; _src text; _yes int; _no int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT created_by, status, source INTO _owner, _status, _src FROM verified_routes WHERE id = _route_id;
  IF _status IS NULL THEN RAISE EXCEPTION 'Road not found'; END IF;
  IF _owner = _uid AND _src <> 'ai' THEN RETURN _status; END IF;
  INSERT INTO route_feedback(route_id, user_id, correct, note, lat, lng, reason, photo_path)
  VALUES (_route_id, _uid, _helpful, left(_note, 500), _lat, _lng, left(_reason, 80), _photo)
  ON CONFLICT (route_id, user_id) DO UPDATE SET correct = EXCLUDED.correct, note = EXCLUDED.note,
    reason = EXCLUDED.reason, photo_path = EXCLUDED.photo_path, created_at = now();
  SELECT count(*) FILTER (WHERE correct), count(*) FILTER (WHERE NOT correct) INTO _yes, _no
  FROM route_feedback WHERE route_id = _route_id AND (reviewed_at_cutoff(_route_id) IS NULL OR created_at > reviewed_at_cutoff(_route_id));
  UPDATE verified_routes SET helpful_count = _yes, unhelpful_count = _no WHERE id = _route_id;
  IF _status IN ('rejected','closed') THEN RETURN _status; END IF;
  IF _src = 'ai' THEN
    IF NOT _helpful THEN _status := 'rejected';
    ELSIF _yes >= 3 THEN _status := 'verified'; END IF;
  ELSE
    IF _no >= 5 AND _status <> 'review' THEN _status := 'review';
    ELSIF _status = 'pending' AND _yes >= 3 THEN _status := 'verified'; END IF;
  END IF;
  UPDATE verified_routes SET status = _status,
    times_used = COALESCE(times_used,0) + CASE WHEN _helpful THEN 1 ELSE 0 END
  WHERE id = _route_id;
  RETURN _status;
END $$;

CREATE OR REPLACE FUNCTION public.reviewed_at_cutoff(_route_id uuid)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT reviewed_at FROM verified_routes WHERE id = _route_id
$$;

CREATE OR REPLACE FUNCTION public.review_route(_route_id uuid, _keep boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.is_super_admin()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  UPDATE verified_routes SET status = CASE WHEN _keep THEN 'verified' ELSE 'closed' END,
    reviewed_at = now(), review_decision = CASE WHEN _keep THEN 'maintain' ELSE 'close' END,
    unhelpful_count = 0
  WHERE id = _route_id;
  RETURN CASE WHEN _keep THEN 'verified' ELSE 'closed' END;
END $$;

CREATE OR REPLACE FUNCTION public.routes_for_review()
RETURNS TABLE(id uuid, trace jsonb, builder_name text, local_name text, source text, path_type text, unhelpful_count int, helpful_count int, created_at timestamptz, reports jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.is_super_admin()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN QUERY SELECT r.id, r.trace, r.builder_name, r.local_name, r.source, r.path_type, r.unhelpful_count, r.helpful_count, r.created_at,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('reason', f.reason, 'note', f.note, 'photo', f.photo_path, 'at', f.created_at) ORDER BY f.created_at DESC)
      FROM route_feedback f WHERE f.route_id = r.id AND NOT f.correct), '[]'::jsonb)
  FROM verified_routes r WHERE r.status = 'review' ORDER BY r.created_at;
END $$;

GRANT EXECUTE ON FUNCTION public.report_route(uuid, boolean, text, text, text, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_route(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.routes_for_review() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reviewed_at_cutoff(uuid) TO authenticated;