
ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS is_group boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_community boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS avatar_path text,
  ADD COLUMN IF NOT EXISTS community_id uuid;

ALTER TABLE public.chat_members
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member';

CREATE TABLE IF NOT EXISTS public.communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  avatar_path text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  announcement_chat_id uuid REFERENCES public.chats(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.communities TO authenticated;
GRANT ALL ON public.communities TO service_role;

ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed in users can browse communities"
  ON public.communities FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can create communities"
  ON public.communities FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creators can update their communities"
  ON public.communities FOR UPDATE TO authenticated
  USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creators can delete their communities"
  ON public.communities FOR DELETE TO authenticated USING (auth.uid() = created_by);

DROP TRIGGER IF EXISTS communities_set_updated_at ON public.communities;
CREATE TRIGGER communities_set_updated_at
  BEFORE UPDATE ON public.communities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.chats
  ADD CONSTRAINT chats_community_id_fkey FOREIGN KEY (community_id)
  REFERENCES public.communities(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS chats_community_id_idx ON public.chats(community_id);
CREATE INDEX IF NOT EXISTS chat_members_user_id_idx ON public.chat_members(user_id);
CREATE INDEX IF NOT EXISTS messages_chat_id_created_at_idx ON public.messages(chat_id, created_at);
