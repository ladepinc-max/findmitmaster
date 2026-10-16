import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as SupabaseClient;

/**
 * STUN alone fails on carrier-grade NAT (common on MTN / Telecel / AT mobile
 * data), so a public TURN relay is included as the fallback path.
 */
export const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
    {
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turn:openrelay.metered.ca:443?transport=tcp",
      ],
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
  iceCandidatePoolSize: 4,
};

export type CallKind = "video" | "audio";
export type CallStatus = "ringing" | "accepted" | "declined" | "ended";
export type SignalType = "offer" | "answer" | "ice";

export interface ChatCall {
  id: string;
  conversation_id: string;
  caller_id: string;
  receiver_id: string;
  kind: CallKind;
  status: CallStatus;
  created_at: string;
}

export interface CallSignal {
  id: string;
  call_id: string;
  from_id: string;
  to_id: string;
  type: SignalType;
  data: unknown;
  created_at: string;
}

export async function startCall(input: {
  conversationId: string;
  callerId: string;
  receiverId: string;
  kind?: CallKind;
}): Promise<ChatCall> {
  const { data, error } = await db
    .from("chat_calls")
    .insert({
      conversation_id: input.conversationId,
      caller_id: input.callerId,
      receiver_id: input.receiverId,
      kind: input.kind ?? "video",
      status: "ringing",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as ChatCall;
}

export async function setCallStatus(callId: string, status: CallStatus) {
  await db.from("chat_calls").update({ status, updated_at: new Date().toISOString() }).eq("id", callId);
}

export async function getCall(callId: string): Promise<ChatCall | null> {
  const { data } = await db.from("chat_calls").select("*").eq("id", callId).maybeSingle();
  return (data as ChatCall | null) ?? null;
}


export async function sendSignal(input: {
  callId: string;
  fromId: string;
  toId: string;
  type: SignalType;
  data: unknown;
}) {
  await db.from("chat_call_signals").insert({
    call_id: input.callId,
    from_id: input.fromId,
    to_id: input.toId,
    type: input.type,
    data: input.data as never,
  });
}

/** Subscribe to signals addressed to me for a given call. */
export function subscribeSignals(
  callId: string,
  meId: string,
  handler: (signal: CallSignal) => void,
) {
  const channel = supabase
    .channel(`call-signals-${callId}-${meId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "chat_call_signals",
        filter: `call_id=eq.${callId}`,
      },
      (payload) => {
        const row = payload.new as CallSignal;
        if (row.to_id === meId) handler(row);
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeCall(callId: string, handler: (call: ChatCall) => void) {
  const channel = supabase
    .channel(`call-${callId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "chat_calls", filter: `id=eq.${callId}` },
      (payload) => handler(payload.new as ChatCall),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Ring listener: fires when someone calls me. */
export function subscribeIncomingCalls(meId: string, handler: (call: ChatCall) => void) {
  const channel = supabase
    .channel(`incoming-calls-${meId}-${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "chat_calls",
        filter: `receiver_id=eq.${meId}`,
      },
      (payload) => handler(payload.new as ChatCall),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/* -------------------------------- translator ------------------------------- */

export interface TranslatorLanguage {
  code: string; // MyMemory / ISO code
  speech: string; // Web Speech API BCP-47 code
  label: string;
}

export const TRANSLATOR_LANGUAGES: TranslatorLanguage[] = [
  { code: "en", speech: "en-US", label: "English" },
  { code: "fr", speech: "fr-FR", label: "French" },
  { code: "tw", speech: "ak-GH", label: "Twi" },
  { code: "ee", speech: "ee-GH", label: "Ewe" },
  { code: "gaa", speech: "gaa-GH", label: "Ga" },
  { code: "ha", speech: "ha-NG", label: "Hausa" },
  { code: "yo", speech: "yo-NG", label: "Yoruba" },
  { code: "sw", speech: "sw-KE", label: "Swahili" },
  { code: "es", speech: "es-ES", label: "Spanish" },
  { code: "pt", speech: "pt-PT", label: "Portuguese" },
  { code: "de", speech: "de-DE", label: "German" },
  { code: "ar", speech: "ar-SA", label: "Arabic" },
  { code: "zh", speech: "zh-CN", label: "Chinese" },
  { code: "hi", speech: "hi-IN", label: "Hindi" },
];

/** Free translation via MyMemory (no API key needed). */
export async function translateText(text: string, from: string, to: string): Promise<string> {
  if (!text.trim()) return "";
  if (from === to) return text;
  const res = await fetch(
    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`,
  );
  if (!res.ok) throw new Error("translate failed");
  const data = (await res.json()) as { responseData?: { translatedText?: string } };
  const translated = data.responseData?.translatedText;
  if (!translated) throw new Error("no translation");
  return translated;
}

/**
 * Signals inserted before the other side mounted its listener would otherwise be
 * lost (the caller's offer is sent while the receiver is still on the ring screen).
 * Replaying the stored rows on join is what makes the call actually connect.
 */
export async function fetchPendingSignals(callId: string, meId: string): Promise<CallSignal[]> {
  const { data } = await db
    .from("chat_call_signals")
    .select("*")
    .eq("call_id", callId)
    .eq("to_id", meId)
    .order("created_at", { ascending: true });
  return (data as CallSignal[] | null) ?? [];
}

/** A call that is still ringing for me in this conversation (missed realtime insert). */
export async function fetchRingingCall(meId: string, conversationId: string): Promise<ChatCall | null> {
  const { data } = await db
    .from("chat_calls")
    .select("*")
    .eq("receiver_id", meId)
    .eq("conversation_id", conversationId)
    .eq("status", "ringing")
    .gte("created_at", new Date(Date.now() - 45_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ChatCall | null) ?? null;
}
