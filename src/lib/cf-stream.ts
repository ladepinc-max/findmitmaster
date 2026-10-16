/**
 * Cloudflare Stream helpers (browser side).
 *
 * Videos go straight from the phone to Cloudflare's edge, which converts them
 * into small HLS segments. Playback is locked to 360p in the player so viewers
 * on Ghanaian mobile data download only a few hundred kilobytes per minute.
 */

export interface CfStreamUpload {
  uid: string;
  hlsUrl: string;
}

/** True when the backend has Cloudflare Stream credentials configured. */
export async function isCfStreamReady(): Promise<boolean> {
  try {
    const res = await fetch("/api/cf-stream-upload");
    if (!res.ok) return false;
    const data = (await res.json()) as { configured?: boolean };
    return Boolean(data.configured);
  } catch {
    return false;
  }
}

/**
 * Uploads one video file to Cloudflare Stream and returns its id + HLS url.
 * `onProgress` receives 0..1 while the file is being sent.
 */
export async function uploadToCfStream(
  file: File,
  options: { durationSeconds?: number | null; onProgress?: (fraction: number) => void } = {},
): Promise<CfStreamUpload> {
  const ticket = await fetch("/api/cf-stream-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: file.name,
      maxDurationSeconds: Math.max(60, Math.round(options.durationSeconds ?? 7200)),
    }),
  });
  if (!ticket.ok) {
    const detail = (await ticket.json().catch(() => null)) as { error?: string } | null;
    throw new Error(detail?.error ?? "Could not start the Cloudflare upload");
  }
  const { uid, uploadURL, hlsUrl } = (await ticket.json()) as {
    uid: string;
    uploadURL: string;
    hlsUrl: string;
  };

  await new Promise<void>((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadURL);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) options.onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Upload failed — check the connection"));
    xhr.send(form);
  });

  options.onProgress?.(1);
  return { uid, hlsUrl };
}

/** Marker stored in `media_path` when a lesson lives on Cloudflare Stream. */
export function cfMediaPath(uid: string) {
  return `cf:${uid}`;
}

export function isCfMediaPath(path: string | null | undefined) {
  return Boolean(path?.startsWith("cf:"));
}
