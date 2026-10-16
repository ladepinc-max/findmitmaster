import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, LogOut, Megaphone, Users, X } from "lucide-react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/UserAvatar";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { Composer } from "@/components/chat/Composer";
import { supabase } from "@/integrations/supabase/client";
import wallpaperSrc from "@/assets/chat-wallpaper.jpg";
const wallpaper = { url: wallpaperSrc };
import { formatDayLabel, type ChatMessage, type ProfileLite } from "@/lib/chat";
import {
  fetchGroupMembers,
  fetchGroupMessages,
  leaveChat,
  sendGroupMessage,
  type GroupMember,
  type GroupSummary,
} from "@/lib/groups";

interface Props {
  group: GroupSummary;
  me: ProfileLite;
  onBack: () => void;
  onChanged: () => void;
}

export function GroupChatWindow({ group, me, onBack, onChanged }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [showMembers, setShowMembers] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const isAdmin = group.role === "admin";
  const readOnly = group.is_community && !isAdmin;

  useEffect(() => {
    let active = true;
    setLoading(true);
    void fetchGroupMessages(group.id)
      .then((rows) => {
        if (active) setMessages(rows);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    void fetchGroupMembers(group.id)
      .then((rows) => {
        if (active) setMembers(rows);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [group.id]);

  useEffect(() => {
    const channel = supabase
      .channel(`group-messages:${group.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `chat_id=eq.${group.id}`,
        },
        (payload) => {
          const row = payload.new as ChatMessage | null;
          if (!row) return;
          setMessages((prev) => {
            const next = prev.filter((m) => m.id !== row.id);
            next.push(row);
            return next.sort((a, b) => a.created_at.localeCompare(b.created_at));
          });
          onChanged();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const grouped = useMemo(() => {
    const out: Array<{ label: string; items: ChatMessage[] }> = [];
    for (const m of messages) {
      const label = formatDayLabel(m.created_at);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(m);
      else out.push({ label, items: [m] });
    }
    return out;
  }, [messages]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-wa-divider bg-wa-header px-3 py-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to chats"
          className="flex size-9 items-center justify-center rounded-full text-wa-muted hover:bg-wa-divider md:hidden"
        >
          <ArrowLeft className="size-5" />
        </button>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-wa-green/15 text-wa-green">
          {group.is_community ? <Megaphone className="size-5" /> : <Users className="size-5" />}
        </span>
        <button
          type="button"
          onClick={() => setShowMembers((v) => !v)}
          className="min-w-0 flex-1 text-left"
        >
          <p className="truncate text-sm font-semibold text-wa-text">{group.name}</p>
          <p className="truncate text-xs text-wa-muted">
            {members.length || group.members} members
            {group.is_community ? " · announcements" : ""}
          </p>
        </button>
        <button
          type="button"
          aria-label="Leave group"
          onClick={async () => {
            await leaveChat(group.id, me.id);
            toast.success("You left the group");
            onChanged();
            onBack();
          }}
          className="flex size-9 items-center justify-center rounded-full text-wa-muted hover:bg-wa-divider"
        >
          <LogOut className="size-5" />
        </button>
      </header>

      {showMembers ? (
        <div className="max-h-48 overflow-y-auto border-b border-wa-divider bg-wa-header px-3 py-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-2 py-1.5">
              <UserAvatar photoPath={m.photo_path} name={m.display_name} className="size-8" />
              <span className="min-w-0 flex-1 truncate text-sm text-wa-text">
                {m.id === me.id ? "You" : m.display_name}
              </span>
              {m.role === "admin" ? (
                <span className="rounded-full bg-wa-green/15 px-2 py-0.5 text-[11px] font-semibold text-wa-green">
                  Admin
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div
        className="relative min-h-0 flex-1 space-y-2 overflow-y-auto bg-[#E5DDD5] bg-cover bg-center px-3 py-4"
        style={{
          backgroundImage: `linear-gradient(rgba(229,221,213,0.8), rgba(229,221,213,0.8)), url(${wallpaper.url})`,
        }}
      >
        {loading ? (
          <p className="text-center text-xs text-wa-muted">Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="mx-auto w-fit rounded-md bg-white/80 px-3 py-1.5 text-center text-xs text-wa-muted shadow-sm">
            No messages yet.
          </p>
        ) : null}

        {grouped.map((g) => (
          <div key={g.label} className="space-y-1.5">
            <div className="flex justify-center py-2">
              <span className="rounded-md bg-white/80 px-3 py-1 text-[11px] font-medium text-wa-muted shadow-sm">
                {g.label}
              </span>
            </div>
            {g.items.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                mine={m.sender_id === me.id}
                sender={
                  m.sender_id === me.id
                    ? me
                    : memberById.get(m.sender_id) ??
                      ({
                        id: m.sender_id,
                        username: "member",
                        display_name: "Member",
                        photo_path: null,
                        last_seen: null,
                      } as ProfileLite)
                }
                showSender={m.sender_id !== me.id}
                starred={false}
                replyTo={
                  (m as unknown as { reply_to?: string | null }).reply_to
                    ? messages.find(
                        (x) => x.id === (m as unknown as { reply_to?: string }).reply_to,
                      ) ?? null
                    : null
                }
                onReply={setReplyTo}
              />
            ))}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {replyTo ? (
        <div className="flex items-center gap-2 border-t border-wa-divider bg-wa-header px-3 py-2">
          <div className="min-w-0 flex-1 rounded-md border-l-4 border-wa-green bg-wa-panel px-2 py-1">
            <p className="text-[11px] font-semibold text-wa-green">Replying</p>
            <p className="truncate text-xs text-wa-muted">
              {replyTo.content || replyTo.media_name || "Attachment"}
            </p>
          </div>
          <button
            type="button"
            aria-label="Cancel reply"
            onClick={() => setReplyTo(null)}
            className="flex size-8 items-center justify-center rounded-full text-wa-muted hover:bg-wa-divider"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : null}

      {readOnly ? (
        <p className="border-t border-wa-divider bg-wa-header px-4 py-3 text-center text-xs text-wa-muted">
          Only admins can post in this announcement group.
        </p>
      ) : (
        <Composer
          meId={me.id}
          onSend={async (payload) => {
            const msg = await sendGroupMessage({
              chatId: group.id,
              senderId: me.id,
              replyTo: replyTo?.id ?? null,
              ...payload,
            });
            setReplyTo(null);
            setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
            onChanged();
          }}
        />
      )}
    </div>
  );
}
