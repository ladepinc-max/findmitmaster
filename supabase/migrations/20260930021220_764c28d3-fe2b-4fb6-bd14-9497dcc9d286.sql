REVOKE ALL ON FUNCTION public.can_view_contact(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_visible_contact(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_visible_contact(uuid) TO authenticated;