
CREATE POLICY "community-news upload own" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'community-news' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "community-news read" ON storage.objects FOR SELECT
USING (bucket_id = 'community-news' AND (
  (auth.uid() IS NOT NULL AND (storage.foldername(name))[1] = auth.uid()::text)
  OR EXISTS (SELECT 1 FROM public.community_news n WHERE n.media_path = storage.objects.name AND n.status = 'approved')
  OR public.has_role(auth.uid(), 'admin') OR public.is_super_admin()
));
CREATE POLICY "community-news delete own" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'community-news' AND (storage.foldername(name))[1] = auth.uid()::text);
