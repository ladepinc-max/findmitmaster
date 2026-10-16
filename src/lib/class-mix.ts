/**
 * Class mixer — builds the ONE picture the whole class watches.
 *
 * The teacher's browser draws its own camera onto a small 640x360 canvas and,
 * while a student is on stage, overlays that student in a corner box. Audio
 * from the teacher and the on-stage student is mixed together. The result is a
 * single low-bandwidth stream published once to Cloudflare, which turns it
 * into HLS for every watching student.
 */

const WIDTH = 640;
const HEIGHT = 360;
const FPS = 24;

function videoElementFor(stream: MediaStream | null) {
  if (!stream) return null;
  const el = document.createElement("video");
  el.srcObject = stream;
  el.autoplay = true;
  el.muted = true;
  el.playsInline = true;
  void el.play().catch(() => undefined);
  return el;
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  el: HTMLVideoElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const vw = el.videoWidth || w;
  const vh = el.videoHeight || h;
  const scale = Math.max(w / vw, h / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  ctx.drawImage(el, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

export interface ClassMix {
  stream: MediaStream;
  /** Show (or clear) the on-stage student in the corner box. */
  setGuestVideo: (stream: MediaStream | null) => void;
  /** Mix (or clear) the on-stage student's voice into the broadcast. */
  setGuestAudio: (track: MediaStreamTrack | null) => void;
  stop: () => void;
}

export function createClassMix(teacherStream: MediaStream): ClassMix {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d")!;

  const teacherEl = videoElementFor(teacherStream);
  let guestEl: HTMLVideoElement | null = null;

  const timer = window.setInterval(() => {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    if (teacherEl && teacherEl.videoWidth > 0) drawCover(ctx, teacherEl, 0, 0, WIDTH, HEIGHT);
    if (guestEl && guestEl.videoWidth > 0) {
      const w = Math.round(WIDTH * 0.3);
      const h = Math.round(HEIGHT * 0.3);
      const x = WIDTH - w - 12;
      const y = HEIGHT - h - 12;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      drawCover(ctx, guestEl, x, y, w, h);
      ctx.restore();
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
    }
  }, Math.round(1000 / FPS));

  const videoTrack = canvas.captureStream(FPS).getVideoTracks()[0]!;

  // ---- audio mixing ----
  const audioCtx = new AudioContext();
  const destination = audioCtx.createMediaStreamDestination();
  const teacherAudio = teacherStream.getAudioTracks()[0];
  if (teacherAudio) {
    audioCtx
      .createMediaStreamSource(new MediaStream([teacherAudio]))
      .connect(destination);
  }
  let guestNode: MediaStreamAudioSourceNode | null = null;

  const stream = new MediaStream([videoTrack, ...destination.stream.getAudioTracks()]);

  return {
    stream,
    setGuestVideo: (guestStream) => {
      guestEl?.remove();
      guestEl = videoElementFor(guestStream);
    },
    setGuestAudio: (track) => {
      guestNode?.disconnect();
      guestNode = null;
      if (!track) return;
      guestNode = audioCtx.createMediaStreamSource(new MediaStream([track]));
      guestNode.connect(destination);
    },
    stop: () => {
      window.clearInterval(timer);
      guestNode?.disconnect();
      guestEl?.remove();
      teacherEl?.remove();
      videoTrack.stop();
      void audioCtx.close().catch(() => undefined);
    },
  };
}
