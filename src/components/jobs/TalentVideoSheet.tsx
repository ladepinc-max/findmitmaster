import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatClock, parseVideos, signedTalentUrl } from "@/lib/talent-media";
import type { TalentProfile } from "@/lib/jobs";
import { cn } from "@/lib/utils";

/** Proof videos are free to watch — only the contact details sit behind the paywall. */
export function TalentVideoSheet({
  talent,
  startIndex,
  open,
  onOpenChange,
  onUnlock,
  unlocked,
}: {
  talent: TalentProfile | null;
  startIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUnlock: () => void;
  unlocked: boolean;
}) {
  const videos = parseVideos(talent?.video_paths);
  const [index, setIndex] = useState(startIndex);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => setIndex(startIndex), [startIndex, talent?.id]);

  useEffect(() => {
    let active = true;
    setUrl(null);
    const path = videos[index]?.p;
    if (!open || !path) return;
    void signedTalentUrl(path).then((next) => active && setUrl(next));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index, talent?.id]);

  if (!talent) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-3xl bg-card">
        <SheetHeader className="text-left">
          <SheetTitle>{talent.expertise}</SheetTitle>
          <SheetDescription>
            {videos.length} proof video{videos.length === 1 ? "" : "s"} — free to watch
          </SheetDescription>
        </SheetHeader>

        <div className="mt-3 overflow-hidden rounded-2xl bg-black">
          {url ? (
            <video src={url} controls autoPlay playsInline className="aspect-video w-full object-contain" />
          ) : (
            <div className="aspect-video w-full animate-pulse bg-secondary" />
          )}
        </div>

        <div className="mt-3 flex gap-2">
          {videos.map((video, position) => (
            <button
              key={video.p}
              type="button"
              onClick={() => setIndex(position)}
              className={cn(
                "flex-1 rounded-full border py-1.5 text-xs font-medium",
                position === index ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground",
              )}
            >
              Video {position + 1} · {formatClock(video.d)}
            </button>
          ))}
        </div>

        <Button className="mt-4 h-11 w-full rounded-full font-semibold" onClick={onUnlock}>
          {unlocked ? "Contact & hire" : (
            <>
              <Lock className="mr-2 size-4" /> Unlock contact for GHS 30
            </>
          )}
        </Button>
      </SheetContent>
    </Sheet>
  );
}
