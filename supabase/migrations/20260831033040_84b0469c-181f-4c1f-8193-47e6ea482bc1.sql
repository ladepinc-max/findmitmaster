
CREATE POLICY "class media readable by signed-in users" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'class-media');
CREATE POLICY "class media owner insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'class-media' AND (storage.foldername(name))[1] = (auth.uid())::text);
CREATE POLICY "class media owner update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'class-media' AND (storage.foldername(name))[1] = (auth.uid())::text);
CREATE POLICY "class media owner delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'class-media' AND (storage.foldername(name))[1] = (auth.uid())::text);
