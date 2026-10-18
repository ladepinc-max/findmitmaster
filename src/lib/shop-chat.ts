import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchConversations, findOrCreateConversation, type ConversationSummary } from "@/lib/chat";

export function shopThreads(threads: ConversationSummary[], linkedIds: string[]) {
  const ids = new Set(linkedIds);
  return threads.filter((thread) => ids.has(thread.id));
}

export function activeProductCount(products: { is_available: boolean }[]) {
  return products.filter((product) => product.is_available).length;
}

export async function openShopConversation(shopId: string, customerId: string, ownerId: string) {
  const id = await findOrCreateConversation(customerId, ownerId);
  const { error } = await supabase.from("shop_conversations").upsert(
    { shop_id: shopId, customer_id: customerId, conversation_id: id },
    { onConflict: "shop_id,customer_id", ignoreDuplicates: true },
  );
  if (error) throw error;
  return id;
}

export function useShopInbox(shopId: string, meId?: string) {
  const [threads, setThreads] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const refresh = useCallback(async () => {
    if (!meId) { setLoading(false); return; }
    try {
      const { data, error } = await supabase.from("shop_conversations").select("conversation_id").eq("shop_id", shopId);
      if (error) throw error;
      const ids = (data ?? []).map((row) => row.conversation_id);
      const list = ids.length ? shopThreads(await fetchConversations(meId), ids) : [];
      setThreads(list);
      setFailed(false);
    } catch { setFailed(true); }
    finally { setLoading(false); }
  }, [shopId, meId]);
  useEffect(() => {
    setThreads([]);
    setLoading(true);
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    const channel = meId ? supabase.channel(`shop-inbox:${shopId}:${meId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `receiver_id=eq.${meId}` }, () => void refresh()).subscribe() : null;
    return () => { window.clearInterval(timer); if (channel) void supabase.removeChannel(channel); };
  }, [shopId, meId, refresh]);
  return { threads, loading, failed, refresh, unread: threads.reduce((sum, thread) => sum + thread.unread, 0) };
}