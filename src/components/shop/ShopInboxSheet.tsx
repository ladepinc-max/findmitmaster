import { useState } from "react";
import { Loader2, MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShopChatSheet } from "./ShopChatSheet";
import { useShopInbox } from "@/lib/shop-chat";
import type { ConversationSummary } from "@/lib/chat";

export function ShopInboxSheet({ shopId, meId, onClose }: { shopId: string; meId: string; onClose: () => void }) {
  const inbox = useShopInbox(shopId, meId);
  const [selected, setSelected] = useState<ConversationSummary | null>(null);
  if (selected) return <ShopChatSheet conversationId={selected.id} meId={meId} otherId={selected.other.id} title={selected.other.display_name || selected.other.username} onClose={() => { setSelected(null); void inbox.refresh(); }} />;
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/60" onClick={onClose}>
    <section role="dialog" aria-modal="true" aria-label="Shop messages" className="flex h-[78dvh] w-full max-w-lg animate-in slide-in-from-bottom flex-col rounded-t-3xl border-t border-border bg-card shadow-2xl motion-reduce:animate-none" onClick={(e) => e.stopPropagation()}>
      <header className="flex items-center gap-2 border-b border-border p-4"><MessageCircle className="size-5" /><h2 className="flex-1 font-display font-bold">Shop messages</h2><Button size="icon" variant="ghost" aria-label="Close inbox" onClick={onClose}><X className="size-5" /></Button></header>
      <div className="flex-1 overflow-y-auto p-3">
        {inbox.loading ? <Loader2 className="mx-auto mt-8 size-5 animate-spin" /> : inbox.failed ? <Button variant="outline" onClick={() => void inbox.refresh()}>Retry loading messages</Button> : !inbox.threads.length ? <p className="py-8 text-center text-sm text-muted-foreground">No customer messages yet</p> : inbox.threads.map((thread) => <Button key={thread.id} variant="ghost" className="mb-1 h-auto w-full justify-start gap-3 py-3 text-left" onClick={() => setSelected(thread)}>
          <MessageCircle className="size-5 shrink-0 text-primary" /><span className="min-w-0 flex-1"><span className="block truncate font-semibold">{thread.other.display_name || thread.other.username}</span><span className="block truncate text-xs font-normal text-muted-foreground">{thread.last_message_text || "New conversation"}</span></span>{thread.unread > 0 ? <span className="rounded-full bg-primary px-2 text-xs text-primary-foreground">{thread.unread}</span> : null}
        </Button>)}
      </div>
    </section>
  </div>;
}