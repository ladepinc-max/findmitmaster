CREATE POLICY "teacher writes own replay files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'live-replays' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "teacher updates own replay files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'live-replays' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'live-replays' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "teacher deletes own replay files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'live-replays' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "replay files readable by teacher or granted students"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'live-replays'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1
        FROM public.live_replays r
        JOIN public.replay_access a ON a.replay_id = r.id
        WHERE a.user_id = auth.uid()
          AND (r.video_url = storage.objects.name OR r.thumbnail_url = storage.objects.name)
      )
    )
  );