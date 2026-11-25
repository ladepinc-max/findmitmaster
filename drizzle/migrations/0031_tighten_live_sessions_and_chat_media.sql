DROP POLICY IF EXISTS "live_sessions_update" ON public.live_sessions;
CREATE POLICY "live_sessions_update_own" ON public.live_sessions
  FOR UPDATE TO authenticated USING (auth.uid() = host_id) WITH CHECK (auth.uid() = host_id);

DROP POLICY IF EXISTS "Signed-in users can view chat media" ON storage.objects;
CREATE POLICY "Chat media visible to sender and recipients" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'chat-media' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.messages m
        WHERE (m.media_url = storage.objects.name OR m.media_path = storage.objects.name)
          AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid()
               OR (m.chat_id IS NOT NULL AND public.is_chat_member(m.chat_id, auth.uid())))
      )
    )
  );