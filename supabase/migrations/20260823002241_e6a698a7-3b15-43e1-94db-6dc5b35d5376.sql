REVOKE EXECUTE ON FUNCTION public.is_conversation_member(uuid, uuid) FROM anon, public;

CREATE POLICY "Signed-in users can view chat media" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'chat-media');
CREATE POLICY "Users can upload their own chat media" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update their own chat media" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete their own chat media" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);
