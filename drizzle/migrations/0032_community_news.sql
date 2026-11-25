
ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS name_key text;
ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS discussion_chat_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS communities_name_key_uniq ON public.communities(name_key) WHERE name_key IS NOT NULL;

CREATE TABLE public.community_news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  community_name text NOT NULL,
  community_id uuid REFERENCES public.communities(id) ON DELETE SET NULL,
  media_path text NOT NULL,
  media_type text NOT NULL DEFAULT 'video',
  duration_seconds integer,
  status text NOT NULL DEFAULT 'pending',
  ad_title text, ad_tagline text, ad_cta text, ad_link text, ad_rating numeric,
  views_count integer NOT NULL DEFAULT 0,
  reviewed_by uuid, reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.community_news TO anon;
GRANT SELECT, INSERT, DELETE ON public.community_news TO authenticated;
GRANT ALL ON public.community_news TO service_role;
ALTER TABLE public.community_news ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved news is public" ON public.community_news FOR SELECT USING (status = 'approved');
CREATE POLICY "Authors see own news" ON public.community_news FOR SELECT TO authenticated USING (auth.uid() = author_id);
CREATE POLICY "Admins see all news" ON public.community_news FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.is_super_admin());
CREATE POLICY "Authors submit pending news" ON public.community_news FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id AND status = 'pending' AND community_id IS NULL AND reviewed_by IS NULL AND ad_title IS NULL);
CREATE POLICY "Authors delete own news" ON public.community_news FOR DELETE TO authenticated USING (auth.uid() = author_id);
CREATE INDEX community_news_status_idx ON public.community_news(status, created_at DESC);

CREATE TABLE public.community_news_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  news_id uuid NOT NULL REFERENCES public.community_news(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.community_news_comments TO anon;
GRANT SELECT, INSERT, DELETE ON public.community_news_comments TO authenticated;
GRANT ALL ON public.community_news_comments TO service_role;
ALTER TABLE public.community_news_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Comments on approved news are public" ON public.community_news_comments FOR SELECT USING (EXISTS (SELECT 1 FROM public.community_news n WHERE n.id = news_id AND n.status = 'approved'));
CREATE POLICY "Signed in users comment" ON public.community_news_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND length(body) BETWEEN 1 AND 1000 AND EXISTS (SELECT 1 FROM public.community_news n WHERE n.id = news_id AND n.status = 'approved'));
CREATE POLICY "Delete own comments" ON public.community_news_comments FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.news_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  news_id uuid,
  title text NOT NULL,
  body text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE, DELETE ON public.news_notifications TO authenticated;
GRANT ALL ON public.news_notifications TO service_role;
ALTER TABLE public.news_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own news notices" ON public.news_notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Mark own news notices" ON public.news_notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Delete own news notices" ON public.news_notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.ensure_news_community(_name text, _owner uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _key text := lower(regexp_replace(trim(_name), '\s+', ' ', 'g'));
  _cid uuid; _chat uuid; _title text;
BEGIN
  IF _key = '' THEN RAISE EXCEPTION 'Community name required'; END IF;
  SELECT id, discussion_chat_id INTO _cid, _chat FROM communities WHERE name_key = _key;
  _title := initcap(regexp_replace(trim(_name), '\s+', ' ', 'g'));
  IF _cid IS NULL THEN
    INSERT INTO communities(name, description, created_by, name_key)
    VALUES (_title || ' Community', 'Local news and discussion for ' || _title, _owner, _key)
    ON CONFLICT (name_key) WHERE name_key IS NOT NULL DO NOTHING
    RETURNING id INTO _cid;
    IF _cid IS NULL THEN SELECT id, discussion_chat_id INTO _cid, _chat FROM communities WHERE name_key = _key; END IF;
  END IF;
  IF _chat IS NULL THEN
    INSERT INTO chats(created_by, name, description, is_group, is_community, community_id, last_message, last_message_at)
    VALUES (_owner, _title || ' Community', 'Community discussion', true, false, _cid, 'Community created', now())
    RETURNING id INTO _chat;
    UPDATE communities SET discussion_chat_id = _chat WHERE id = _cid;
    INSERT INTO chat_members(chat_id, user_id, role) VALUES (_chat, _owner, 'member') ON CONFLICT DO NOTHING;
  END IF;
  RETURN _cid;
END $$;
REVOKE EXECUTE ON FUNCTION public.ensure_news_community(text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.review_community_news(_id uuid, _approve boolean, _ad_title text DEFAULT NULL, _ad_tagline text DEFAULT NULL, _ad_cta text DEFAULT NULL, _ad_link text DEFAULT NULL, _ad_rating numeric DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n community_news%ROWTYPE; _cid uuid; _chat uuid;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR is_super_admin()) THEN RAISE EXCEPTION 'Admins only'; END IF;
  SELECT * INTO n FROM community_news WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;
  IF NOT _approve THEN
    UPDATE community_news SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now() WHERE id = _id;
    INSERT INTO news_notifications(user_id, news_id, title, body)
    VALUES (n.author_id, _id, 'News not published', 'Your news "' || n.title || '" doesn''t meet our community standards.');
    RETURN 'rejected';
  END IF;
  _cid := ensure_news_community(n.community_name, n.author_id);
  SELECT discussion_chat_id INTO _chat FROM communities WHERE id = _cid;
  UPDATE community_news SET status = 'approved', community_id = _cid, reviewed_by = auth.uid(), reviewed_at = now(),
    ad_title = nullif(trim(_ad_title), ''), ad_tagline = nullif(trim(_ad_tagline), ''), ad_cta = nullif(trim(_ad_cta), ''),
    ad_link = nullif(trim(_ad_link), ''), ad_rating = _ad_rating
  WHERE id = _id;
  INSERT INTO chat_members(chat_id, user_id, role) VALUES (_chat, n.author_id, 'member') ON CONFLICT DO NOTHING;
  INSERT INTO messages(chat_id, sender_id, message_type, content, body)
  VALUES (_chat, n.author_id, 'news', _id::text, n.title);
  UPDATE chats SET last_message = '📰 ' || n.title, last_message_at = now() WHERE id = _chat;
  INSERT INTO news_notifications(user_id, news_id, title, body)
  VALUES (n.author_id, _id, 'News published', 'Your news "' || n.title || '" is now live.');
  RETURN 'approved';
END $$;
REVOKE EXECUTE ON FUNCTION public.review_community_news(uuid, boolean, text, text, text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_community_news(uuid, boolean, text, text, text, text, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.join_community_discussion(_community_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _chat uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  SELECT discussion_chat_id INTO _chat FROM communities WHERE id = _community_id;
  IF _chat IS NULL THEN RAISE EXCEPTION 'Community has no discussion'; END IF;
  INSERT INTO chat_members(chat_id, user_id, role) VALUES (_chat, auth.uid(), 'member') ON CONFLICT DO NOTHING;
  RETURN _chat;
END $$;
REVOKE EXECUTE ON FUNCTION public.join_community_discussion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_community_discussion(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.community_member_count(_community_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM chat_members m JOIN communities c ON c.discussion_chat_id = m.chat_id WHERE c.id = _community_id
$$;
GRANT EXECUTE ON FUNCTION public.community_member_count(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.increment_community_news_view(_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE community_news SET views_count = views_count + 1 WHERE id = _id AND status = 'approved'
$$;
GRANT EXECUTE ON FUNCTION public.increment_community_news_view(uuid) TO anon, authenticated;
