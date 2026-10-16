import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface LiveReplay {
  id: string;
  teacher_id: string;
  class_id: string | null;
  title: string;
  video_url: string;
  thumbnail_url: string | null;
  duration_seconds: number;
  views_count: number;
  created_at: string;
  teacher?: { id: string; display_name: string; username: string; photo_path: string | null } | null;
}

const BUCKET = "live-replays";
const TEACHER = "id,display_name,username,photo_path";

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

/** Every recording this teacher produced. */
export async function fetchTeachingReplays(teacherId: string) {
  const { data, error } = await supabase
    .from("live_replays")
    .select(`*, teacher:profiles!live_replays_teacher_id_fkey(${TEACHER})`)
    .eq("teacher_id", teacherId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as LiveReplay[] | null) ?? [];
}

/** Recordings this student was granted access to (paid / joined the live). */
export async function fetchWatchableReplays(userId: string) {
  const { data, error } = await supabase
    .from("replay_access")
    .select(`granted_at, replay:live_replays(*, teacher:profiles!live_replays_teacher_id_fkey(${TEACHER}))`)
    .eq("user_id", userId)
    .order("granted_at", { ascending: false });
  if (error) throw error;
  const rows = (data as unknown as { replay: LiveReplay | null }[] | null) ?? [];
  return rows.map((row) => row.replay).filter((row): row is LiveReplay => Boolean(row));
}

export async function bumpReplayViews(replay: LiveReplay) {
  await supabase
    .from("live_replays")
    .update({ views_count: replay.views_count + 1 })
    .eq("id", replay.id);
}

export async function deleteReplay(replay: LiveReplay) {
  await supabase.storage.from(BUCKET).remove(
    [replay.video_url, replay.thumbnail_url].filter((p): p is string => Boolean(p)),
  );
  const { error } = await supabase.from("live_replays").delete().eq("id", replay.id);
  if (error) throw error;
}

const urlCache = new Map<string, string>();

/** Signed URL — Storage rules only hand it out to the teacher or granted students. */
export async function signedReplayUrl(path: string | null | undefined) {
  if (!path) return null;
  const hit = urlCache.get(path);
  if (hit) return hit;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 4);
  if (!data?.signedUrl) return null;
  urlCache.set(path, data.signedUrl);
  return data.signedUrl;
}

export function useReplayUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!path) {
      setUrl(null);
      return;
    }
    void signedReplayUrl(path).then((value) => {
      if (active) setUrl(value);
    });
    return () => {
      active = false;
    };
  }, [path]);
  return url;
}

/* ------------------------------------------------------------------ */
/* Recording                                                           */
/* ------------------------------------------------------------------ */

export interface RecorderTracks {
  /** Teacher camera track (always recorded). */
  teacher?: MediaStreamTrack | null;
  /** Student currently on the main stage, if any. */
  student?: MediaStreamTrack | null;
  /** Microphone tracks mixed into the recording. */
  audio?: MediaStreamTrack[];
}

export interface LiveRecording {
  update(tracks: RecorderTracks): void;
  stop(): Promise<{ blob: Blob; thumbnail: Blob | null; durationSeconds: number } | null>;
  active(): boolean;
}

// Recordings are forced to 360p so replays stay light on data.
const W = 640;
const H = 360;

function attach(track: MediaStreamTrack | null | undefined, current: HTMLVideoElement | null) {
  if (!track) return null;
  const el = current ?? document.createElement("video");
  el.muted = true;
  el.playsInline = true;
  el.autoplay = true;
  const stream = el.srcObject as MediaStream | null;
  if (!stream || stream.getVideoTracks()[0]?.id !== track.id) {
    el.srcObject = new MediaStream([track]);
    void el.play().catch(() => undefined);
  }
  return el;
}

function drawCover(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, x: number, y: number, w: number, h: number) {
  const vw = video.videoWidth || 16;
  const vh = video.videoHeight || 9;
  const scale = Math.max(w / vw, h / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  ctx.drawImage(video, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/**
 * Records the composite class stage (teacher full frame, or student full frame
 * with the teacher in a corner box) plus every live microphone.
 */
export function startLiveRecording(initial: RecorderTracks): LiveRecording | null {
  if (typeof MediaRecorder === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  let teacherEl: HTMLVideoElement | null = attach(initial.teacher, null);
  let studentEl: HTMLVideoElement | null = attach(initial.student, null);
  let raf = 0;
  let thumbnail: Blob | null = null;
  let thumbShot = false;
  const startedAt = Date.now();

  const paint = () => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    const main = studentEl ?? teacherEl;
    if (main && main.readyState >= 2) drawCover(ctx, main, 0, 0, W, H);
    if (studentEl && teacherEl && teacherEl.readyState >= 2) {
      const pw = 108;
      const ph = 144;
      const px = W - pw - 14;
      const py = H - ph - 14;
      ctx.save();
      ctx.fillStyle = "#000";
      ctx.fillRect(px, py, pw, ph);
      ctx.beginPath();
      ctx.rect(px, py, pw, ph);
      ctx.clip();
      drawCover(ctx, teacherEl, px, py, pw, ph);
      ctx.restore();
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 3;
      ctx.strokeRect(px, py, pw, ph);
    }
    if (!thumbShot && Date.now() - startedAt > 2500) {
      thumbShot = true;
      canvas.toBlob(
        (blob) => {
          if (blob) thumbnail = blob;
        },
        "image/jpeg",
        0.8,
      );
    }
    raf = requestAnimationFrame(paint);
  };
  raf = requestAnimationFrame(paint);

  const stream = canvas.captureStream(24);

  // Mix all microphones into one audio track.
  const AudioCtor: typeof AudioContext | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const audioCtx = AudioCtor ? new AudioCtor() : null;
  const destination = audioCtx?.createMediaStreamDestination() ?? null;
  const mixed = new Set<string>();
  const addAudio = (tracks: MediaStreamTrack[] | undefined) => {
    if (!audioCtx || !destination) return;
    for (const track of tracks ?? []) {
      if (!track || mixed.has(track.id)) continue;
      mixed.add(track.id);
      audioCtx.createMediaStreamSource(new MediaStream([track])).connect(destination);
    }
  };
  addAudio(initial.audio);
  destination?.stream.getAudioTracks().forEach((track) => stream.addTrack(track));

  const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find(
    (type) => MediaRecorder.isTypeSupported(type),
  );
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 600_000 } : undefined);
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start(4000);

  return {
    active: () => recorder.state !== "inactive",
    update(tracks) {
      teacherEl = attach(tracks.teacher, teacherEl) ?? teacherEl;
      if (tracks.student) studentEl = attach(tracks.student, studentEl);
      else studentEl = null;
      addAudio(tracks.audio);
    },
    stop() {
      cancelAnimationFrame(raf);
      if (recorder.state === "inactive") return Promise.resolve(null);
      return new Promise((resolve) => {
        recorder.onstop = () => {
          void audioCtx?.close();
          stream.getTracks().forEach((track) => track.stop());
          const blob = new Blob(chunks, { type: mime ?? "video/webm" });
          resolve({
            blob,
            thumbnail,
            durationSeconds: Math.round((Date.now() - startedAt) / 1000),
          });
        };
        recorder.stop();
      });
    },
  };
}

/* ------------------------------------------------------------------ */
/* Saving                                                              */
/* ------------------------------------------------------------------ */

export async function saveLiveReplay(params: {
  teacherId: string;
  classId: string | null;
  className: string;
  blob: Blob;
  thumbnail: Blob | null;
  durationSeconds: number;
  studentIds: string[];
}) {
  const stamp = Date.now();
  const videoPath = `${params.teacherId}/${stamp}.webm`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(videoPath, params.blob, { contentType: params.blob.type || "video/webm", upsert: false });
  if (uploadError) throw uploadError;

  let thumbPath: string | null = null;
  if (params.thumbnail && params.thumbnail.size > 0) {
    thumbPath = `${params.teacherId}/${stamp}-thumb.jpg`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(thumbPath, params.thumbnail, { contentType: "image/jpeg", upsert: false });
    if (error) thumbPath = null;
  }

  const date = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const { data, error } = await supabase
    .from("live_replays")
    .insert({
      teacher_id: params.teacherId,
      class_id: params.classId,
      title: `Live on ${date} — ${params.className}`,
      video_url: videoPath,
      thumbnail_url: thumbPath,
      duration_seconds: params.durationSeconds,
    })
    .select("*")
    .single();
  if (error) throw error;
  const replay = data as unknown as LiveReplay;

  const students = Array.from(new Set(params.studentIds)).filter((id) => id && id !== params.teacherId);
  if (students.length) {
    await supabase
      .from("replay_access")
      .insert(students.map((id) => ({ replay_id: replay.id, user_id: id })));
  }
  return { replay, students };
}

export function formatDuration(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${String(m % 60).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }
  return `${m}:${String(rest).padStart(2, "0")}`;
}
