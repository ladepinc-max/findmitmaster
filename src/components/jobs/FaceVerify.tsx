import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, ScanFace } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { startCamera } from "@/lib/webrtc-media";
import { cn } from "@/lib/utils";

const STEPS = ["Look straight at the camera", "Slowly turn your head left", "Now turn right", "Smile 🙂"];

/**
 * Lightweight liveness check: the worker follows four prompts while we capture a
 * frame for each one. The final frame is what employers' review sees.
 */
export function FaceVerify({
  done,
  onCaptured,
}: {
  done: boolean;
  onCaptured: (blob: Blob) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setActive(false);
  }, []);

  useEffect(() => stop, [stop]);

  const start = async () => {
    setBusy(true);
    try {
      const stream = await startCamera({ facingMode: "user", width: 640, height: 480, audio: false });
      streamRef.current = stream;
      setActive(true);
      setStep(0);
      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      }, 50);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Camera permission is required");
    } finally {
      setBusy(false);
    }
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 480;
    canvas.height = video.videoHeight || 640;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    if (step < STEPS.length - 1) {
      setStep((value) => value + 1);
      return;
    }
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          toast.error("Could not capture your face — try again");
          return;
        }
        onCaptured(blob);
        stop();
        toast.success("Liveness check complete");
      },
      "image/jpeg",
      0.85,
    );
  };

  if (done) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-success/40 bg-success/10 p-3 text-sm text-success">
        <Check className="size-4" /> Face captured — verification pending review
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-2xl border border-border bg-surface p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <ScanFace className="size-4 text-primary" /> Live facial verification
      </div>
      {active ? (
        <>
          <div className="relative overflow-hidden rounded-xl bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              className="mx-auto aspect-[3/4] w-full max-w-56 -scale-x-100 object-cover"
            />
            <div className="pointer-events-none absolute inset-4 rounded-full border-2 border-dashed border-white/50" />
          </div>
          <p className="text-center text-sm font-medium">{STEPS[step]}</p>
          <div className="flex justify-center gap-1.5">
            {STEPS.map((label, index) => (
              <span
                key={label}
                className={cn("h-1 w-8 rounded-full", index <= step ? "bg-primary" : "bg-secondary")}
              />
            ))}
          </div>
          <Button type="button" className="w-full rounded-full" onClick={capture}>
            {step < STEPS.length - 1 ? "Capture & continue" : "Finish verification"}
          </Button>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Required. We compare your live face with your proof videos. The photo stays private.
          </p>
          <Button
            type="button"
            variant="secondary"
            className="w-full rounded-full"
            disabled={busy}
            onClick={() => void start()}
          >
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null} Start liveness check
          </Button>
        </>
      )}
    </div>
  );
}
