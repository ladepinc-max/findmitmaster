import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Live viewfinder that stays inside FindMit, so the phone never leaves the page
 * (opening the system camera app can make Android reload the tab and lose the form).
 */
export function InAppCamera({
  onShot,
  onClose,
  onFallback,
}: {
  onShot: (blob: Blob) => void;
  onClose: () => void;
  onFallback: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError(null);
    stop();
    navigator.mediaDevices
      ?.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play().catch(() => undefined);
        }
      })
      .catch(() => setError("Camera is blocked. Allow camera access or choose a photo instead."));
    if (!navigator.mediaDevices) setError("This browser can't open the camera here.");
    return () => {
      cancelled = true;
      stop();
    };
  }, [facing, stop]);

  const snap = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const scale = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
    c.toBlob(
      (b) => {
        if (!b) return;
        stop();
        onShot(b);
      },
      "image/jpeg",
      0.85,
    );
  };

  return (
    <div className="fixed inset-0 z-[1000] flex flex-col bg-foreground">
      <div className="relative min-h-0 flex-1">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          onLoadedData={() => setReady(true)}
          className="h-full w-full object-cover"
        />
        {error ? (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <div className="space-y-3 rounded-2xl bg-card p-4">
              <p className="text-sm">{error}</p>
              <Button onClick={onFallback}>Choose a photo</Button>
            </div>
          </div>
        ) : null}
        <Button
          size="icon"
          variant="secondary"
          className="absolute left-4 top-4 rounded-full"
          onClick={() => {
            stop();
            onClose();
          }}
          aria-label="Close camera"
        >
          <X className="size-5" />
        </Button>
      </div>
      <div className="flex items-center justify-around bg-card px-6 py-4">
        <button type="button" className="text-xs text-muted-foreground underline" onClick={() => { stop(); onFallback(); }}>
          Gallery
        </button>
        <button
          type="button"
          onClick={snap}
          disabled={!ready}
          aria-label="Take photo"
          className="grid size-16 place-items-center rounded-full border-4 border-primary bg-background disabled:opacity-50"
        >
          <Camera className="size-6 text-primary" />
        </button>
        <Button
          size="icon"
          variant="outline"
          className="rounded-full"
          onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
          aria-label="Flip camera"
        >
          <RefreshCw className="size-5" />
        </Button>
      </div>
    </div>
  );
}
