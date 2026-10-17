import { useEffect, useRef, useState } from "react";
import { Loader2, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { fetchMessages, formatTime12h, markConversationRead, sendMessage, type ChatMessage } from "@/lib/chat";

/** Bottom-sheet chat used on the shop page (customer) and the shop dashboard (owner). */
export function ShopChatSheet({
  conversationId,
  meId,
  otherId,
  title,
  subtitle,
  draft,
  onClose,
}: {
  conversationId: string;
  meId: string;
  otherId: string;
  title: string;
  subtitle?: string | null;
  draft?: string;
  onClose: () => void;
}) {
  const [msgs, setMsgs] = useState<ChatMessage[] | null>(null);
  const [text, setText] = useState(draft ?? "");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const list = await fetchMessages(conversationId);
        if (!alive) return;
        setMsgs((prev) => (prev && prev.length === list.length && prev.at(-1)?.id === list.at(-1)?.id ? prev : list));
        if (list.some((m) => m.receiver_id === meId && !m.is_read)) void markConversationRead(conversationId, meId);
      } catch {
        if (alive) setMsgs((p) => p ?? []);
      }
    };
    void load();
    const channel = supabase
      .channel(`shop-chat-${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, () => void load())
      .subscribe();
    const poll = window.setInterval(() => void load(), 5000);
    return () => {
      alive = false;
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [conversationId, meId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [msgs?.length]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const m = await sendMessage({ conversationId, senderId: meId, receiverId: otherId, content: body });
      setMsgs((prev) => [...(prev ?? []), m]);
      setText("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/60" onClick={onClose}>
      <div
        className="flex h-[78dvh] w-full max-w-lg animate-in slide-in-from-bottom flex-col rounded-t-3xl border-t border-border bg-card shadow-2xl duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted" />
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-display font-bold">{title}</p>
            {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
          </div>
          <Button size="icon" variant="ghost" aria-label="Close chat" onClick={onClose}>
            <X className="size-5" />
          </Button>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
          {msgs === null ? (
            <div className="flex justify-center pt-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
          ) : msgs.length === 0 ? (
            <p className="pt-8 text-center text-sm text-muted-foreground">Say hello 👋</p>
          ) : (
            msgs.map((m) => {
              const mine = m.sender_id === meId;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                    <p className="whitespace-pre-wrap break-words">{m.deleted_for_everyone ? "Message deleted" : m.content || "📎 Attachment"}</p>
                    <p className="mt-0.5 text-right text-[10px] opacity-70">{formatTime12h(m.created_at)}</p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>
        <form
          className="flex gap-2 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message" />
          <Button type="submit" size="icon" aria-label="Send" disabled={sending || !text.trim()}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
}
