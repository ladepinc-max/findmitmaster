CREATE TABLE public.shop_conversations (
 shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
 customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(shop_id, customer_id)
);
GRANT SELECT, INSERT ON public.shop_conversations TO authenticated;
GRANT ALL ON public.shop_conversations TO service_role;
ALTER TABLE public.shop_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Shop parties read linked chats" ON public.shop_conversations FOR SELECT TO authenticated USING (customer_id = auth.uid() OR public.owns_shop(shop_id, auth.uid()));
CREATE POLICY "Customers link their shop chats" ON public.shop_conversations FOR INSERT TO authenticated WITH CHECK (customer_id = auth.uid() AND public.shop_is_active(shop_id) AND EXISTS (SELECT 1 FROM public.shops s JOIN public.conversations c ON c.id = conversation_id WHERE s.id = shop_id AND s.owner_id <> auth.uid() AND ((c.participant1_id = auth.uid() AND c.participant2_id = s.owner_id) OR (c.participant2_id = auth.uid() AND c.participant1_id = s.owner_id))));
CREATE INDEX shop_conversations_thread_idx ON public.shop_conversations(conversation_id);