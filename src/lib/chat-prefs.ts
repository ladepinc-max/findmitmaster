import { chatDb as db } from "@/lib/chat";

export interface ChatPref {
  id: string;
  conversation_id: string | null;
  message_id: string | null;
  pinned: boolean;
  muted: boolean;
  starred: boolean;
}

/** All of my pin / mute / star preferences. */
export async function fetchChatPrefs(meId: string): Promise<ChatPref[]> {
  const { data } = await db
    .from("chat_prefs")
    .select("id, conversation_id, message_id, pinned, muted, starred")
    .eq("user_id", meId);
  return (data ?? []) as ChatPref[];
}

async function upsertPref(
  meId: string,
  key: { conversation_id: string } | { message_id: string },
  patch: Partial<Pick<ChatPref, "pinned" | "muted" | "starred">>,
) {
  const filter = "conversation_id" in key ? key : key;
  const query = db.from("chat_prefs").select("id").eq("user_id", meId);
  const { data: existing } = await ("conversation_id" in key
    ? query.eq("conversation_id", key.conversation_id).is("message_id", null)
    : query.eq("message_id", key.message_id)
  ).maybeSingle();

  if (existing?.id) {
    await db.from("chat_prefs").update(patch).eq("id", existing.id);
    return;
  }
  await db.from("chat_prefs").insert({ user_id: meId, ...filter, ...patch });
}

export function setConversationPinned(meId: string, conversationId: string, pinned: boolean) {
  return upsertPref(meId, { conversation_id: conversationId }, { pinned });
}

export function setConversationMuted(meId: string, conversationId: string, muted: boolean) {
  return upsertPref(meId, { conversation_id: conversationId }, { muted });
}

export function setMessageStarred(meId: string, messageId: string, starred: boolean) {
  return upsertPref(meId, { message_id: messageId }, { starred });
}

/** "Delete for everyone" keeps the row but blanks the content, like WhatsApp. */
export async function deleteMessageForEveryone(messageId: string) {
  await db
    .from("messages")
    .update({
      deleted_for_everyone: true,
      content: "",
      body: "",
      media_url: null,
      media_name: null,
    })
    .eq("id", messageId);
}

export async function markDelivered(conversationId: string, meId: string) {
  await db
    .from("messages")
    .update({ delivered_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("receiver_id", meId)
    .is("delivered_at", null);
}
