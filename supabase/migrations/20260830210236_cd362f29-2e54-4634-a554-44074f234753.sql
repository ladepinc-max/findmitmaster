
CREATE POLICY "talent videos readable by signed-in users"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'talent-videos');

CREATE POLICY "talent videos owner insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'talent-videos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "talent videos owner update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'talent-videos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "talent videos owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'talent-videos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "verification owner select"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'talent-verification' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "verification owner insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'talent-verification' AND (storage.foldername(name))[1] = auth.uid()::text);
