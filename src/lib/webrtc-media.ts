import { describeMediaError, logDebug } from "@/lib/webrtc-debug";

// Capacitor injects window.Capacitor inside the native WebView — no import needed,
// so this module works even before the Capacitor packages are installed.
function isNativePlatform(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

/** Request native runtime permissions (no-op on the web). */
export async function ensureMediaPermissions(): Promise<void> {
  if (!isNativePlatform()) return;

  // Try the community permissions plugin first (if the APK bundles it).
  try {
    const modName = "@capacitor-community/permissions";
    const mod = (await import(/* @vite-ignore */ modName)) as {
      Permissions?: { requestPermissions(opts: { permissions: string[] }): Promise<unknown> };
    };
    if (mod.Permissions) {
      await mod.Permissions.requestPermissions({ permissions: ["camera", "microphone"] });
      logDebug("media", "Native camera/mic permissions requested");
      return;
    }
  } catch (e) {
    logDebug("media", "Permissions plugin unavailable", {
      level: "warn",
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  // Fallback: @capacitor/camera also triggers the CAMERA/mic runtime prompt.
  try {
    const modName = "@capacitor/camera";
    const mod = (await import(/* @vite-ignore */ modName)) as {
      Camera?: { requestPermissions(opts?: unknown): Promise<unknown> };
    };
    await mod.Camera?.requestPermissions({ permissions: ["camera", "photos"] });
    logDebug("media", "Camera plugin permissions requested");
  } catch {
    logDebug("media", "No permission plugin found — relying on the WebView prompt", {
      level: "warn",
    });
  }
}


/** Microphone-only access (voice notes, voice calls) with the same guarantees. */
export async function startMicrophone(): Promise<MediaStream> {
  logDebug("media", "startMicrophone requested", {
    detail: { secure: window.isSecureContext, native: isNativePlatform() },
  });
  await ensureMediaPermissions();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    logDebug("media", "startMicrophone succeeded");
    return stream;
  } catch (err) {
    const e = err as DOMException;
    logDebug("media", "startMicrophone failed", { level: "error", detail: describeMediaError(err) });
    if (e?.name === "NotAllowedError") {
      throw new Error(
        "Microphone blocked. Allow microphone access in your browser site settings (or Phone Settings > Apps > FindMit > Permissions), then try again.",
      );
    }
    if (e?.name === "NotFoundError") throw new Error("No microphone found on this device.");
    throw err;
  }
}

/**
 * Mobile-safe getUserMedia for WebRTC (web + Capacitor APK).
 *
 * 1. On native, requests CAMERA/MIC runtime permissions first
 *    (Android 13+ needs this before the WebView will grant the stream).
 * 2. Uses mobile-friendly constraints with echo cancellation.
 * 3. Surfaces a clear, actionable message for common failure modes.
 */
export async function startCamera(options?: {
  facingMode?: "user" | "environment";
  width?: number;
  height?: number;
  audio?: boolean;
}): Promise<MediaStream> {
  const { facingMode = "user", width = 640, height = 480, audio = true } = options ?? {};

  logDebug("media", "startCamera requested", {
    detail: { facingMode, width, height, audio, secure: window.isSecureContext, native: isNativePlatform() },
  });

  if (typeof window !== "undefined" && !window.isSecureContext) {
    logDebug("media", "getUserMedia requires a secure context (https)", { level: "warn" });
    console.warn("getUserMedia requires a secure context (https)", window.isSecureContext);
  }

  // 1. Runtime permission request on native (best-effort, optional plugin).
  await ensureMediaPermissions();

  // 2. Acquire the stream. On native, go straight to getUserMedia — the
  // MainActivity WebChromeClient auto-grants the WebView permission request.
  // If it still fails, force the native permission dialog and retry once.
  const acquire = () =>
    navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: width }, height: { ideal: height } },
      audio: audio
        ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        : false,
    });

  try {
    let stream: MediaStream;
    try {
      stream = await acquire();
    } catch (firstErr) {
      if (!isNativePlatform()) throw firstErr;
      logDebug("media", "getUserMedia failed on native; forcing permission dialog + retry", {
        level: "warn",
        detail: describeMediaError(firstErr),
      });
      try {
        const modName = "@capacitor/camera";
        const mod = (await import(/* @vite-ignore */ modName)) as {
          Camera?: { requestPermissions(opts?: unknown): Promise<unknown> };
        };
        await mod.Camera?.requestPermissions();
      } catch {
        /* plugin absent — still retry, WebView prompt may suffice */
      }
      stream = await acquire();
    }
    logDebug("media", "startCamera succeeded", {
      detail: stream.getTracks().map((t) => ({ kind: t.kind, label: t.label, settings: t.getSettings() })),
    });
    return stream;
  } catch (err) {
    const e = err as DOMException;
    const description = describeMediaError(err);
    logDebug("media", "startCamera failed", { level: "error", detail: description });
    console.error("getUserMedia error", e?.name, e?.message);
    if (e?.name === "NotAllowedError") {
      throw new Error(
        "Camera & Microphone blocked. Allow them in Phone Settings > Apps > FindMit > Permissions, then try again.",
      );
    }
    if (e?.name === "NotFoundError" || e?.name === "OverconstrainedError") {
      throw new Error("No camera or microphone found on this device.");
    }
    throw err;
  }
}
