import { supabase } from "@/integrations/supabase/client";

export interface LiveSessionHost {
  id: string;
  username: string;
  display_name: string;
  photo_path: string | null;
}

export interface LiveSession {
  id: string;
  host_id: string;
  topic: string;
  is_live: boolean;
  viewer_count: number;
  created_at: string;
  host: LiveSessionHost | null;
}

export type SignalType = "offer" | "answer" | "ice";

export interface LiveSignal {
  id: string;
  session_id: string;
  from_id: string;
  to_id: string;
  type: SignalType;
  data: unknown;
  created_at: string;
}

export const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
  audio: true,
};

const SESSION_SELECT =
  "*, host:profiles!live_sessions_host_id_fkey(id,username,display_name,photo_path)";

export async function fetchLiveSessions() {
  const { data, error } = await supabase
    .from("live_sessions")
    .select(SESSION_SELECT)
    .eq("is_live", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as LiveSession[] | null) ?? [];
}

export const LIVE_STORAGE_KEY = "findmeet.activeLiveId";

export function rememberLiveId(id: string) {
  try {
    localStorage.setItem(LIVE_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function forgetLiveId() {
  try {
    localStorage.removeItem(LIVE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function rememberedLiveId(): string | null {
  try {
    return localStorage.getItem(LIVE_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Returns the caller's own ongoing live session, if any. */
export async function fetchMyLiveSession(hostId: string) {
  const { data, error } = await supabase
    .from("live_sessions")
    .select(SESSION_SELECT)
    .eq("host_id", hostId)
    .eq("is_live", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as LiveSession | null) ?? null;
}

export async function createLiveSession(hostId: string, topic: string) {
  const { data, error } = await supabase
    .from("live_sessions")
    .insert({ host_id: hostId, topic, is_live: true, viewer_count: 0 })
    .select(SESSION_SELECT)
    .single();
  if (error) throw error;
  const session = data as unknown as LiveSession;
  rememberLiveId(session.id);
  return session;
}

export async function endLiveSession(sessionId: string) {
  const { error } = await supabase
    .from("live_sessions")
    .update({ is_live: false, viewer_count: 0 })
    .eq("id", sessionId);
  forgetLiveId();
  if (error) throw error;
}

/** Tells every viewer of a session to re-send their WebRTC offer to the host. */
export async function broadcastHostReconnect(sessionId: string) {
  const channel = supabase.channel(`live-reconnect-${sessionId}`);
  await channel.subscribe();
  await channel.send({ type: "broadcast", event: "host-reconnect", payload: {} });
  void supabase.removeChannel(channel);
}

/** Viewer side: run `onReconnect` when the host comes back online. */
export function subscribeToHostReconnect(sessionId: string, onReconnect: () => void) {
  const channel = supabase
    .channel(`live-reconnect-${sessionId}`)
    .on("broadcast", { event: "host-reconnect" }, () => onReconnect())
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}


export async function bumpViewerCount(sessionId: string, delta: number) {
  // adjust_live_viewer_count is a new DB function not yet present in generated types.
  const { data, error } = await supabase.rpc(
    "adjust_live_viewer_count" as "increment_post_view",
    { _session_id: sessionId, _delta: delta } as unknown as { _post_id: string },
  );
  if (error) return 0;
  return (data as unknown as number | null) ?? 0;
}

export async function sendSignal(params: {
  sessionId: string;
  fromId: string;
  toId: string;
  type: SignalType;
  data: unknown;
}) {
  const { error } = await supabase.from("live_signals").insert({
    session_id: params.sessionId,
    from_id: params.fromId,
    to_id: params.toId,
    type: params.type,
    data: params.data as never,
  });
  if (error) console.error("signal send failed", error);
}

/** Subscribes to signalling messages addressed to `userId` for one session. */
export function subscribeToSignals(
  sessionId: string,
  userId: string,
  onSignal: (signal: LiveSignal) => void,
) {
  const channel = supabase
    .channel(`live-${sessionId}-${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "live_signals",
        filter: `to_id=eq.${userId}`,
      },
      (payload) => {
        const signal = payload.new as unknown as LiveSignal;
        if (signal.session_id === sessionId) onSignal(signal);
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
