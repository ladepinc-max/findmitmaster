import { useEffect, useMemo, useRef, useState } from "react";
import { useCachedState } from "@/lib/page-cache";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowLeft, MoreVertical, Phone, Search, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { UserAvatar } from "@/components/UserAvatar";
import { OneToOneMessageBubble } from "@/components/chat/OneToOneMessageBubble";
import { OneToOneComposer } from "@/components/chat/OneToOneComposer";
import { CallScreen } from "@/components/chat/CallScreen";
import { supabase } from "@/integrations/supabase/client";
import {
  getCall,
  setCallStatus,
  startCall,
  fetchRingingCall,
  subscribeIncomingCalls,
  type CallKind,
  type ChatCall,
} from "@/lib/calls";
import {
  browserNotify,
  markSenderNotificationsRead,
  setActiveConversation,
} from "@/lib/chat-notifications";
import { startRingtone, stopRingtone } from "@/lib/sounds";
import {
  deleteMessageForEveryone,
  fetchChatPrefs,
  markDelivered,
  setMessageStarred,
} from "@/lib/chat-prefs";
import wallpaperSrc from "@/assets/chat-wallpaper.jpg";
const wallpaper = { url: wallpaperSrc };
import {
  fetchMessages,
  fetchMessagesBefore,
  formatDayLabel,
  lastSeenLabel,
  markConversationRead,
  sendMessage,
  type ChatMessage,
  type ProfileLite,
} from "@/lib/chat";
import { sendPushToUser } from "@/lib/push.functions";
import { loadPrefs } from "@/lib/NotificationService";

interface Props {
  conversationId: string;
  me: ProfileLite;
  other: ProfileLite;
  onBack: () => void;
  onChanged: () => void;
  onToggleInfo?: () => void;
}

export function ChatWindow({ conversationId, me, other, onBack, onChanged, onToggleInfo }: Props) {
  const [loading, setLoading] = useState(true);
  // Last-shown messages paint instantly; the fetch below only merges changes.
  const [messages, setMessages] = useCachedState<ChatMessage[]>(`chat:conv:${conversationId}`, [], (rows) => {
    if (rows.length) setLoading(false);
  });
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [activeCall, setActiveCall] = useState<{ call: ChatCall; isCaller: boolean } | null>(null);
  const [incoming, setIncoming] = useState<ChatCall | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [starred, setStarred] = useState<string[]>([]);
  const [otherTyping, setOtherTyping] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [nearBottom, setNearBottom] = useState(true);
  const [unreadBelow, setUnreadBelow] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(true);
  const pushToUser = useServerFn(sendPushToUser);

  useEffect(() => {
    let active = true;
    void fetchChatPrefs(me.id)
      .then((prefs) => {
        if (active) setStarred(prefs.filter((p) => p.starred && p.message_id).map((p) => p.message_id!));
      })
      .catch(() => undefined);
    void markDelivered(conversationId, me.id).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [me.id, conversationId]);

  // Typing indicator over a realtime broadcast channel.
  const typingChannel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  useEffect(() => {
    const channel = supabase.channel(`typing:${conversationId}`, {
      config: { broadcast: { self: false } },
    });
    channel
      .on("broadcast", { event: "typing" }, (payload) => {
        const from = (payload['payload'] as { userId?: string } | undefined)?.userId;
        if (from && from !== me.id) {
          setOtherTyping(true);
          window.setTimeout(() => setOtherTyping(false), 2500);
        }
      })
      .subscribe();
    typingChannel.current = channel;
    return () => {
      typingChannel.current = null;
      void supabase.removeChannel(channel);
    };
  }, [conversationId, me.id]);

  const notifyTyping = () => {
    void typingChannel.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: me.id },
    });
  };

  const toggleStar = async (message: ChatMessage) => {
    const isStarred = starred.includes(message.id);
    setStarred((prev) => (isStarred ? prev.filter((id) => id !== message.id) : [...prev, message.id]));
    await setMessageStarred(me.id, message.id, !isStarred).catch(() => undefined);
  };

  const removeForEveryone = async (message: ChatMessage) => {
    await deleteMessageForEveryone(message.id);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === message.id
          ? ({ ...m, content: "", media_url: null, deleted_for_everyone: true } as ChatMessage)
          : m,
      ),
    );
    toast.success("Message deleted for everyone");
  };

  useEffect(() => {
    setActiveConversation(conversationId);
    return () => setActiveConversation(null);
  }, [conversationId]);

  // Ring on incoming calls for this conversation, including one that started
  // just before this screen opened.
  useEffect(() => {
    void fetchRingingCall(me.id, conversationId).then((call) => {
      if (!call) return;
      setIncoming(call);
      void startRingtone();
    });
    return subscribeIncomingCalls(me.id, (call) => {
      if (call.conversation_id !== conversationId || call.status !== "ringing") return;
      setIncoming(call);
      void startRingtone();
    });
  }, [me.id, conversationId]);

  useEffect(() => stopRingtone, []);

  const recordMissedCall = async (call: ChatCall) => {
    stopRingtone();
    const latest = await getCall(call.id);

    if (latest && (latest.status === "accepted" || latest.status === "ended")) return;
    await setCallStatus(call.id, "ended");
    await sendMessage({
      conversationId,
      senderId: me.id,
      receiverId: other.id,
      type: "call",
      content: `Missed ${call.kind === "video" ? "video" : "voice"} call`,
    });
    onChanged();
  };

  const closeCall = (call: ChatCall, isCaller: boolean) => {
    setActiveCall(null);
    if (isCaller) void recordMissedCall(call);
  };

  const placeCall = async (kind: CallKind) => {
    try {
      const call = await startCall({
        conversationId,
        callerId: me.id,
        receiverId: other.id,
        kind,
      });
      setActiveCall({ call, isCaller: true });
    } catch {
      toast.error("Could not start the call");
    }
  };

  // No answer after 30s counts as a missed call.
  useEffect(() => {
    if (!activeCall?.isCaller) return;
    const call = activeCall.call;
    const timer = setTimeout(() => {
      void getCall(call.id).then((latest) => {
        if (latest?.status === "ringing") {
          setActiveCall(null);
          void recordMissedCall(call);
        }
      });
    }, 30_000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCall]);

  useEffect(() => {
    let active = true;
    fetchMessages(conversationId)
      .then((rows) => {
        if (active) setMessages(rows);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    void markConversationRead(conversationId, me.id).then(onChanged);
    void markSenderNotificationsRead(me.id, other.id);
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, me.id, other.id]);

  useEffect(() => {
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as ChatMessage | null;
          if (!row) return;
          setMessages((prev) => {
            const next = prev.filter((m) => m.id !== row.id);
            next.push(row);
            return next.sort((a, b) => a.created_at.localeCompare(b.created_at));
          });
          if (row.receiver_id === me.id && !row.is_read) {
            if (!nearBottom) setUnreadBelow((count) => count + 1);
            void markConversationRead(conversationId, me.id);
            void markSenderNotificationsRead(me.id, other.id);
            browserNotify(other.display_name, row.message_type);
          }
          onChanged();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, me.id, nearBottom]);

  useEffect(() => {
    if (nearBottom) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, nearBottom]);

  const jumpToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setUnreadBelow(0);
    setNearBottom(true);
  };

  const loadOlder = async () => {
    const viewport = scrollRef.current;
    const oldest = messages[0];
    if (!viewport || !oldest || loadingOlder || !hasOlder) return;
    const previousHeight = viewport.scrollHeight;
    setLoadingOlder(true);
    try {
      const rows = await fetchMessagesBefore(conversationId, oldest.created_at, 50);
      setHasOlder(rows.length === 50);
      if (rows.length) {
        setMessages((current) => [...rows, ...current]);
        requestAnimationFrame(() => {
          viewport.scrollTop = viewport.scrollHeight - previousHeight;
        });
      }
    } finally {
      setLoadingOlder(false);
    }
  };

  const forwardMessage = async (message: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(message.content || message.media_name || "Attachment");
      toast.success("Message copied — open another chat to forward it");
    } catch {
      toast.error("Could not prepare that message");
    }
  };

  const grouped = useMemo(() => {
    const out: Array<{ label: string; items: ChatMessage[] }> = [];
    const q = searchTerm.trim().toLowerCase();
    const source = q
      ? messages.filter((m) => (m.content ?? "").toLowerCase().includes(q))
      : messages;
    for (const m of source) {
      const label = formatDayLabel(m.created_at);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(m);
      else out.push({ label, items: [m] });
    }
    return out;
  }, [messages, searchTerm]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-chat-wallpaper">
      <header className="sticky top-0 z-30 grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 bg-chat-header px-2 py-2 text-chat-header-foreground shadow-md">
        <div className="flex min-w-0 items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onBack}
          aria-label="Back to chats"
          className="size-10 shrink-0 rounded-full text-chat-header-foreground hover:bg-chat-header-foreground/10 md:hidden"
        >
          <ArrowLeft className="size-5" />
        </Button>
        <UserAvatar
          photoPath={other.photo_path}
          name={other.display_name}
          className="size-10 shrink-0"
        />
        <Button type="button" variant="ghost" onClick={onToggleInfo} className="h-auto min-w-0 flex-1 flex-col items-start gap-0 px-0 text-left hover:bg-transparent">
          <p className="w-full truncate text-sm font-semibold text-chat-header-foreground">{other.display_name}</p>
          <p className="w-full truncate text-xs font-normal text-chat-header-foreground/75">
            {otherTyping ? (
              <span className="text-chat-header-foreground">typing…</span>
            ) : (
              lastSeenLabel(other.last_seen)
            )}
          </p>
        </Button>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Voice call"
            onClick={() => void placeCall("audio")}
            className="size-9 rounded-full text-chat-header-foreground hover:bg-chat-header-foreground/10"
          >
            <Phone className="size-5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Video call"
            onClick={() => void placeCall("video")}
            className="size-9 rounded-full text-chat-header-foreground hover:bg-chat-header-foreground/10"
          >
            <Video className="size-5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Search in chat"
            onClick={() => setShowSearch((v) => !v)}
            className="hidden size-9 rounded-full text-chat-header-foreground hover:bg-chat-header-foreground/10 sm:inline-flex"
          >
            <Search className="size-5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="More options"
            onClick={onToggleInfo}
            className="size-9 rounded-full text-chat-header-foreground hover:bg-chat-header-foreground/10"
          >
            <MoreVertical className="size-5" />
          </Button>
        </div>
      </header>

      {showSearch ? (
        <div className="border-b border-chat-line bg-chat-header px-3 py-2">
          <input
            autoFocus
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search messages"
            className="h-9 w-full rounded-full border-0 bg-chat-input px-4 text-sm text-chat-received-foreground outline-none placeholder:text-chat-received-meta"
          />
        </div>
      ) : null}

      <div
        ref={scrollRef}
        onScroll={(event) => {
          const el = event.currentTarget;
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
          setNearBottom(atBottom);
          if (atBottom) setUnreadBelow(0);
          if (el.scrollTop < 80) void loadOlder();
        }}
        className="relative min-h-0 flex-1 space-y-2 overflow-y-auto bg-chat-wallpaper bg-cover bg-center px-2.5 py-3 sm:px-4"
        style={{ backgroundImage: `linear-gradient(var(--chat-wallpaper-wash), var(--chat-wallpaper-wash)), url(${wallpaper.url})` }}
      >
        {loadingOlder ? <p className="text-center text-xs text-chat-received-meta">Loading older messages…</p> : null}
        {loading ? (
          <p className="text-center text-xs text-chat-received-meta">Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="mx-auto w-fit rounded-lg bg-chat-date px-3 py-1.5 text-center text-xs text-chat-received-meta shadow-sm">
            No messages yet. Say hello 👋
          </p>
        ) : null}

        {grouped.map((group) => (
          <div key={group.label} className="space-y-1.5">
            <div className="flex justify-center py-2">
              <span className="rounded-full bg-chat-date px-3 py-1 text-[11px] font-medium text-chat-received-meta shadow-sm">
                {group.label}
              </span>
            </div>
            {group.items.map((m) => (
              <OneToOneMessageBubble
                key={m.id}
                message={m}
                mine={m.sender_id === me.id}
                sender={m.sender_id === me.id ? me : other}
                starred={starred.includes(m.id)}
                replyTo={
                  (m as unknown as { reply_to?: string | null }).reply_to
                    ? messages.find(
                        (x) => x.id === (m as unknown as { reply_to?: string }).reply_to,
                      ) ?? null
                    : null
                }
                onReply={setReplyTo}
                onStar={(msg) => void toggleStar(msg)}
                onDelete={(msg) => void removeForEveryone(msg)}
                onForward={(msg) => void forwardMessage(msg)}
              />
            ))}
          </div>
        ))}
        <div ref={bottomRef} />
        {!nearBottom ? (
          <Button type="button" variant="secondary" size="icon" onClick={jumpToBottom} aria-label="Scroll to latest messages" className="sticky bottom-2 ml-auto flex size-10 rounded-full bg-chat-input text-chat-received-meta shadow-lg hover:bg-chat-file">
            <ArrowDown className="size-5" />
            {unreadBelow > 0 ? <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-chat-unread px-1 text-[10px] font-bold text-chat-unread-foreground">{unreadBelow > 99 ? "99+" : unreadBelow}</span> : null}
          </Button>
        ) : null}
      </div>

      {replyTo ? (
        <div className="flex items-center gap-2 bg-chat-composer/90 px-3 py-2 backdrop-blur-sm">
          <div className="min-w-0 flex-1 rounded-lg border-l-4 border-chat-primary bg-chat-input px-2 py-1 shadow-sm">
            <p className="text-[11px] font-semibold text-chat-primary">
              Replying to {replyTo.sender_id === me.id ? "yourself" : other.display_name}
            </p>
            <p className="truncate text-xs text-chat-received-meta">
              {replyTo.content || replyTo.media_name || "Attachment"}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Cancel reply"
            onClick={() => setReplyTo(null)}
            className="size-8 rounded-full text-chat-received-meta hover:bg-chat-file"
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : null}

      <OneToOneComposer
        meId={me.id}
        draftKey={conversationId}
        onTyping={notifyTyping}
        onSend={async (payload) => {
          const msg = await sendMessage({
            conversationId,
            senderId: me.id,
            receiverId: other.id,
            replyTo: replyTo?.id ?? null,
            ...payload,
          });
          setReplyTo(null);
          setMessages((prev) =>
            prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
          );
          onChanged();

          const prefs = loadPrefs();
          if (prefs.chatEnabled) {
            void pushToUser({
              data: {
                userId: other.id,
                title: `New message from ${me.display_name}`,
                body: prefs.previewEnabled
                  ? (payload.content?.trim() || "Media")
                  : "New message",
                url: `/chat?c=${conversationId}`,
                tag: `chat-${conversationId}`,
              },
            });
          }
        }}
      />

      {incoming && !activeCall ? (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/85 p-6 text-center">
          <UserAvatar photoPath={other.photo_path} name={other.display_name} className="size-24" />
          <p className="text-lg font-semibold text-white">{other.display_name}</p>
          <p className="text-sm text-white/70">
            Incoming {incoming.kind === "video" ? "video" : "voice"} call…
          </p>
          <div className="mt-4 flex gap-6">
            <button
              type="button"
              onClick={() => {
                stopRingtone();
                void setCallStatus(incoming.id, "declined");
                setIncoming(null);
              }}
              className="flex size-14 items-center justify-center rounded-full bg-red-600 text-white"
              aria-label="Decline call"
            >
              <Phone className="size-6 rotate-[135deg]" />
            </button>
            <button
              type="button"
              onClick={() => {
                stopRingtone();
                setActiveCall({ call: incoming, isCaller: false });
                setIncoming(null);
              }}
              className="flex size-14 items-center justify-center rounded-full bg-wa-green text-white"
              aria-label="Accept call"
            >
              <Video className="size-6" />
            </button>
          </div>
        </div>
      ) : null}

      {activeCall ? (
        <CallScreen
          call={activeCall.call}
          me={me}
          other={other}
          isCaller={activeCall.isCaller}
          onClose={() => closeCall(activeCall.call, activeCall.isCaller)}
        />
      ) : null}
    </div>
  );
}
