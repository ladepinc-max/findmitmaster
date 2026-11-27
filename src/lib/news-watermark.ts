export const NEWS_LOGO = "/FindMit-Icon-Transparent-FINAL.png";
export async function loadNewsLogo(): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = NEWS_LOGO;
  await image.decode();
  return image;
}

/** Paint into the actual encoded frame, not a removable screen overlay. */
export function drawNewsWatermark(ctx: CanvasRenderingContext2D, logo: HTMLImageElement, width: number, height: number) {
  const colors = getComputedStyle(document.documentElement);
  const size = Math.max(28, Math.round(Math.min(width, height) * 0.14));
  const gap = Math.round(size * 0.2);
  const y = height - size - gap * 2;
  ctx.save();
  ctx.globalAlpha = 0.78;
  ctx.fillStyle = colors.getPropertyValue("--news-watermark-background").trim();
  ctx.fillRect(gap, y - gap, size * 4.6, size + gap * 2);
  ctx.globalAlpha = 1;
  ctx.drawImage(logo, gap * 2, y, size, size);
  ctx.fillStyle = colors.getPropertyValue("--news-watermark-foreground").trim();
  ctx.font = `bold ${Math.round(size * 0.5)}px sans-serif`;
  ctx.fillText("FindMit", size + gap * 3, y + size * 0.55);
  ctx.font = `${Math.round(size * 0.24)}px sans-serif`;
  ctx.fillText("findmit.world", size + gap * 3, y + size * 0.87);
  ctx.restore();
}

export function watermarkedVideoStream(video: HTMLVideoElement, camera: MediaStream, logo: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx || !canvas.width || !canvas.height || !canvas.captureStream) throw new Error("Watermarked recording is not supported on this device");
  let frame = 0;
  const draw = () => {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    drawNewsWatermark(ctx, logo, canvas.width, canvas.height);
    frame = requestAnimationFrame(draw);
  };
  draw();
  const stream = canvas.captureStream(30);
  camera.getAudioTracks().forEach((track) => stream.addTrack(track));
  return { stream, stop: () => { cancelAnimationFrame(frame); stream.getVideoTracks().forEach((track) => track.stop()); } };
}

/** Upgrade older news without offering an edited or downloadable original. */
export async function burnExistingNews(blob: Blob, type: "photo" | "video"): Promise<Blob> {
  const logo = await loadNewsLogo();
  const url = URL.createObjectURL(blob);
  try {
    if (type === "photo") {
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Photo processing unavailable");
      ctx.drawImage(image, 0, 0); drawNewsWatermark(ctx, logo, canvas.width, canvas.height);
      return await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Photo processing failed")), "image/jpeg", 0.9));
    }
    const video = document.createElement("video"); video.src = url; video.playsInline = true; video.muted = true;
    await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error("Cannot read this video")); });
    const audio = new AudioContext();
    const source = audio.createMediaElementSource(video); const destination = audio.createMediaStreamDestination(); source.connect(destination);
    await audio.resume();
    const capture = watermarkedVideoStream(video, destination.stream, logo);
    const mime = ["video/webm;codecs=vp8,opus", "video/mp4", "video/webm"].find((value) => MediaRecorder.isTypeSupported(value));
    const recorder = new MediaRecorder(capture.stream, mime ? { mimeType: mime } : {});
    const chunks: Blob[] = [];
    try {
      return await new Promise<Blob>((resolve, reject) => {
        recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
        recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType }));
        recorder.onerror = () => reject(new Error("Video processing failed"));
        video.onended = () => recorder.stop();
        recorder.start(1000);
        void video.play().catch(reject);
      });
    } finally { if (recorder.state === "recording") recorder.stop(); video.pause(); capture.stop(); await audio.close(); }
  } finally { URL.revokeObjectURL(url); }
}