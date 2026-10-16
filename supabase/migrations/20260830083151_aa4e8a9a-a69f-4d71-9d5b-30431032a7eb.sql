CREATE TABLE public.chat_notifications (
  id uuid primary key default gen_random_uuid(),
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  message_type text not null default 'text',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_notifications TO authenticated;
GRANT ALL ON public.chat_notifications TO service_role;

ALTER TABLE public.chat_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own chat notifications" ON public.chat_notifications
  FOR SELECT TO authenticated USING (auth.uid() = receiver_id OR auth.uid() = sender_id);
CREATE POLICY "send chat notifications" ON public.chat_notifications
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "mark own chat notifications read" ON public.chat_notifications
  FOR UPDATE TO authenticated USING (auth.uid() = receiver_id) WITH CHECK (auth.uid() = receiver_id);
CREATE POLICY "delete own chat notifications" ON public.chat_notifications
  FOR DELETE TO authenticated USING (auth.uid() = receiver_id);

CREATE INDEX chat_notifications_unread_idx ON public.chat_notifications (receiver_id, is_read);
CREATE INDEX chat_notifications_sender_idx ON public.chat_notifications (receiver_id, sender_id);

ALTER TABLE public.chat_notifications REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_notifications;