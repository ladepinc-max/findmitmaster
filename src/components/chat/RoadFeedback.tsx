import { useState } from "react";
import { Camera, Loader2, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROAD_PROBLEMS, reportRoute, uploadCommunityPhoto } from "@/lib/community-map";

/** "Was this road 100% helpful?" — asks why when it was not, so the FindMit Team can follow up. */
export function RoadFeedback({
  routeId,
  userId,
  isAi,
  here,
  onDone,
}: {
  routeId: string;
  userId: string;
  isAi: boolean;
  here: { lat: number; lng: number } | null;
  onDone: () => void;
}) {
  const [step, setStep] = useState<"ask" | "why">("ask");
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (helpful: boolean) => {
    setBusy(true);
    try {
      const photoPath = photo ? await uploadCommunityPhoto(userId, photo, "jpg") : null;
      const status = await reportRoute({ routeId, helpful, reason, note, photoPath, lat: here?.lat ?? null, lng: here?.lng ?? null });
      toast.success(
        helpful
          ? status === "verified"
            ? "Thanks! This is now a verified FindMit road."
            : "Thanks for confirming the road!"
          : status === "rejected"
            ? "Thanks. This suggested path has been closed."
            : status === "review"
              ? "Thanks. The FindMit Team will check this road."
              : "Thanks. Your report was recorded.",
      );
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send");
    } finally {
      setBusy(false);
    }
  };

  if (step === "ask")
    return (
      <div className="mt-3 rounded-2xl border border-border bg-wa-panel p-3">
        <p className="text-sm font-semibold">Was this road 100% clear and helpful?</p>
        <div className="mt-2 flex gap-2">
          <Button size="sm" className="flex-1" disabled={busy} onClick={() => void send(true)}>
            <ThumbsUp className="size-4" /> Yes, 100%
          </Button>
          <Button size="sm" variant="outline" className="flex-1" onClick={() => setStep("why")}>
            <ThumbsDown className="size-4" /> Not fully
          </Button>
        </div>
        <button type="button" className="mt-2 text-xs text-muted-foreground" onClick={onDone}>
          Skip
        </button>
      </div>
    );

  return (
    <div className="mt-3 space-y-2 rounded-2xl border border-border bg-wa-panel p-3">
      <p className="text-sm font-semibold">What was the problem?</p>
      {isAi ? <p className="text-xs text-muted-foreground">This suggested path will be closed for everyone.</p> : null}
      <div className="flex flex-wrap gap-1.5">
        {ROAD_PROBLEMS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setReason(r)}
            className={`rounded-full px-3 py-1 text-xs ${reason === r ? "bg-primary text-primary-foreground" : "bg-muted"}`}
          >
            {r}
          </button>
        ))}
      </div>
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tell us more (optional)" maxLength={500} />
      <label className="flex cursor-pointer items-center gap-2 text-xs">
        <Camera className="size-4" /> {photo ? photo.name : "Add photo of the problem (optional)"}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
      </label>
      <Button size="sm" className="w-full" disabled={!reason || busy} onClick={() => void send(false)}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : null} Send report
      </Button>
    </div>
  );
}
