REVOKE EXECUTE ON FUNCTION public.sync_job_applicants_count() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_counts() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fanout_job_alerts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_live_viewer_count(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_replay(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owns_replay(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_paid_job_post(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.adjust_live_viewer_count(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_replay(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.owns_replay(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_paid_job_post(uuid) FROM PUBLIC, anon;

CREATE POLICY "Service role manages phone verifications"
ON public.phone_verifications FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can update broadcasts" ON public.tv_channels;
CREATE POLICY "Hosts teachers and admins can update broadcasts" ON public.tv_channels FOR UPDATE TO authenticated
USING (host_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher') OR public.is_super_admin())
WITH CHECK (host_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher') OR public.is_super_admin());