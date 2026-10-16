ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_to uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_for_everyone boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

CREATE TABLE IF NOT EXISTS public.chat_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.messages(id) ON DELETE CASCADE,
  pinned boolean NOT NULL DEFAULT false,
  muted boolean NOT NULL DEFAULT false,
  starred boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_prefs_user_conversation_key
  ON public.chat_prefs (user_id, conversation_id) WHERE message_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS chat_prefs_user_message_key
  ON public.chat_prefs (user_id, message_id) WHERE message_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_prefs TO authenticated;
GRANT ALL ON public.chat_prefs TO service_role;

ALTER TABLE public.chat_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own chat prefs"
  ON public.chat_prefs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER chat_prefs_set_updated_at
  BEFORE UPDATE ON public.chat_prefs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();