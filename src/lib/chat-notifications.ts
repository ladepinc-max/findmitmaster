import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { MessageType } from "@/lib/chat";
import { enablePush, loadPrefs, notifyChatMessage } from "@/lib/NotificationService";
import { playChatTone } from "@/lib/sounds";

const db = supabase as unknown as SupabaseClient;

export type NotificationType = MessageType;

export interface ChatNotification {
  id: string;
  receiver_id: string;
  sender_id: string;
  conversation_id: string | null;
  message_type: NotificationType;
  is_read: boolean;
  created_at: string;
}

/** Records a notification for the recipient of a message or call. */
export async function createChatNotification(input: {
  receiverId: string;
  senderId: string;
  conversationId?: string | null;
  type: NotificationType;
}) {
  await db.from("chat_notifications").insert({
    receiver_id: input.receiverId,
    sender_id: input.senderId,
    conversation_id: input.conversationId ?? null,
    message_type: input.type,
  });
}

export async function countUnreadNotifications(meId: string): Promise<number> {
  const { count } = await db
    .from("chat_notifications")
    .select("*", { count: "exact", head: true })
    .eq("receiver_id", meId)
    .eq("is_read", false);
  return count ?? 0;
}

/** Marks every notification from one chat partner as read. */
export async function markSenderNotificationsRead(meId: string, senderId: string) {
  await db
    .from("chat_notifications")
    .update({ is_read: true })
    .eq("receiver_id", meId)
    .eq("sender_id", senderId)
    .eq("is_read", false);
}

let activeConversationId: string | null = null;

/** Lets the open chat window suppress its own notification sound. */
export function setActiveConversation(id: string | null) {
  activeConversationId = id;
}

export function subscribeChatNotifications(
  meId: string,
  handler: (row: ChatNotification) => void,
) {
  const channel = supabase
    .channel(`chat-notifications-${meId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "chat_notifications",
        filter: `receiver_id=eq.${meId}`,
      },
      (payload) => handler((payload.new ?? payload.old) as ChatNotification),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

const TYPE_LABEL: Record<string, string> = {
  text: "message",
  image: "photo",
  video: "video",
  audio: "voice note",
  file: "document",
  call: "call",
};

export function notificationLabel(type: string) {
  return TYPE_LABEL[type] ?? "message";
}

/** Fires a pop-up notification when the tab is not focused. */
export function browserNotify(
  senderName: string,
  type: string,
  opts?: { preview?: string; conversationId?: string | null },
) {
  if (typeof document !== "undefined" && document.visibilityState === "visible") return;
  const label = notificationLabel(type);
  void notifyChatMessage({
    senderName,
    preview:
      opts?.preview ?? (type === "call" ? `Missed call from ${senderName}` : `Sent you a ${label}`),
    conversationId: opts?.conversationId ?? null,
  });
}

export function requestNotificationPermission() {
  void enablePush();
}

/** Live unread-notification count for the signed-in user. */
export function useUnreadChatCount(meId: string | null | undefined) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!meId) return;
    try {
      setCount(await countUnreadNotifications(meId));
    } catch {
      /* transient */
    }
  }, [meId]);

  useEffect(() => {
    if (!meId) {
      setCount(0);
      return;
    }
    void refresh();
    const unsubscribe = subscribeChatNotifications(meId, (row) => {
      void refresh();
      const isNew = row && !row.is_read && row.sender_id !== meId;
      const chatOpen =
        typeof document !== "undefined" &&
        document.visibilityState === "visible" &&
        row?.conversation_id != null &&
        row.conversation_id === activeConversationId;
      if (!isNew || chatOpen) return;
      const prefs = loadPrefs();
      if (!prefs.chatEnabled) return;
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        if (prefs.soundEnabled) void playChatTone();
        return;
      }
      void (async () => {
        const { data } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", row.sender_id)
          .maybeSingle();
        await notifyChatMessage({
          senderName: (data as { display_name?: string } | null)?.display_name ?? "Someone",
          preview: `Sent you a ${notificationLabel(row.message_type)}`,
          conversationId: row.conversation_id,
        });
      })();
    });
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      unsubscribe();
      window.removeEventListener("focus", onFocus);
    };
  }, [meId, refresh]);

  return { count, refresh };
}
