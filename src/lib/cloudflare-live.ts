import { supabase } from "@/integrations/supabase/client";

export interface LiveConfig {
  whip_url: string;
  hls_url: string;
  whep_url: string;
  input_id?: string | null;
  customer?: string | null;
}
export interface LiveNow {
  id: number;
  is_live: boolean;
  hls_url: string | null;
  whep_url: string | null;
  title: string | null;
  started_at: string | null;
}

const KEY = "cloudflare_live_config";

/** Loads the saved Cloudflare config: localStorage first, then the database (admins only). */
export async function loadLiveConfig(): Promise<LiveConfig | null> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as LiveConfig;
  } catch {
    /* ignore */
  }
  const { data } = await supabase.from("live_config").select("*").eq("id", 1).maybeSingle();
  if (!data?.whip_url) return null;
  const cfg = data as unknown as LiveConfig;
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg));
  } catch {
    /* ignore */
  }
  return cfg;
}

/** Remember the Cloudflare live input so the next broadcast reuses it. */
export async function saveLiveConfig(cfg: LiveConfig) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg));
  } catch {
    /* ignore */
  }
  const { error } = await supabase.from("live_config").upsert({ id: 1, ...cfg });
  if (error) throw error;
}

export async function fetchLiveNow(): Promise<LiveNow | null> {
  const { data } = await supabase.from("live_now").select("*").eq("id", 1).maybeSingle();
  return (data as unknown as LiveNow | null) ?? null;
}

export async function setLiveNow(row: Partial<LiveNow>) {
  const { error } = await supabase.from("live_now").upsert({ id: 1, ...row });
  if (error) throw error;
}

async function waitIce(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === "complete") return;
  await new Promise<void>((resolve) => {
    const t = setTimeout(resolve, 2000);
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(t);
        resolve();
      }
    });
  });
}

const ICE = [{ urls: "stun:stun.cloudflare.com:3478" }];

/** Publish a stream to Cloudflare Stream via WHIP. */
export async function whipPublish(url: string, stream: MediaStream) {
  const pc = new RTCPeerConnection({ iceServers: ICE, bundlePolicy: "max-bundle" });
  stream.getTracks().forEach((t) => pc.addTransceiver(t, { direction: "sendonly", streams: [stream] }));
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitIce(pc);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/sdp" },
    body: pc.localDescription!.sdp,
  });
  if (!res.ok) {
    pc.close();
    throw new Error(`Cloudflare refused the stream (${res.status})`);
  }
  await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });
  return pc;
}

/** Play a Cloudflare Stream live input via WHEP. */
export async function whepPlay(url: string, video: HTMLVideoElement) {
  const pc = new RTCPeerConnection({ iceServers: ICE, bundlePolicy: "max-bundle" });
  pc.addTransceiver("video", { direction: "recvonly" });
  pc.addTransceiver("audio", { direction: "recvonly" });
  const stream = new MediaStream();
  pc.ontrack = (e) => {
    stream.addTrack(e.track);
    video.srcObject = stream;
    void video.play().catch(() => {
      video.muted = true;
      void video.play().catch(() => {});
    });
  };
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitIce(pc);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/sdp" },
    body: pc.localDescription!.sdp,
  });
  if (!res.ok) {
    pc.close();
    throw new Error(`WHEP ${res.status}`);
  }
  await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });
  return pc;
}
