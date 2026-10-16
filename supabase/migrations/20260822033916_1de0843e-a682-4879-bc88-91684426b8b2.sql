
REVOKE ALL ON FUNCTION public.sync_counts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_post_view(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_post_view(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.is_chat_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_chat_member(uuid, uuid) TO authenticated;
