REVOKE ALL ON FUNCTION public.fanout_job_alerts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_counts() FROM PUBLIC, anon, authenticated;