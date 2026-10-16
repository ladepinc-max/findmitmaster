import { useAppPrice } from "@/lib/pricing";
import { useEffect, useState } from "react";
import { BadgeCheck, Loader2, Lock, MapPin, Play, ScanFace, ShieldCheck } from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";
import { ExpertiseIcon } from "@/components/jobs/ExpertiseIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney, type TalentProfile } from "@/lib/jobs";
import { formatClock, parseVideos, signedTalentUrl, type TalentVideo } from "@/lib/talent-media";
import { cn } from "@/lib/utils";

const AVAILABILITY_LABELS: Record<string, string> = {
  available: "Available now",
  open_to_offers: "Open to offers",
  not_available: "Not available",
};

const GENDER_LABELS: Record<string, string> = { male: "Male", female: "Female", other: "Other" };

export function TalentCard({
  item,
  busy,
  isMine,
  unlocked,
  onEmploy,
  onWatch,
}: {
  item: TalentProfile;
  busy: boolean;
  isMine: boolean;
  unlocked: boolean;
  onEmploy: () => void;
  onWatch: (index: number) => void;
}) {
  const { amount: EMPLOY_FEE } = useAppPrice("talent_employ");
  const videos = parseVideos(item.video_paths);
  const availabilityLabel = AVAILABILITY_LABELS[item.availability] ?? item.availability;
  const isAvailable = item.availability === "available";
  const town = item.town ?? item.location_name;

  return (
    <li className="talent-card p-4">
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <UserAvatar profile={item.talent} className="size-14" />
          {item.talent?.is_verified ? (
            <BadgeCheck className="absolute -bottom-0.5 -right-0.5 size-5 rounded-full bg-card text-accent" />
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 truncate text-base font-bold leading-tight">
              <ExpertiseIcon name={item.expertise} className="mr-1.5 inline size-4 align-[-2px] text-primary" />
              {item.expertise}
            </h3>
            <span className="shrink-0 rounded-full bg-coral/15 px-2.5 py-1 text-xs font-bold text-coral">
              {formatMoney(item.rate_amount, item.rate_currency, item.rate_period)}
              {item.negotiable ? "*" : ""}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {item.talent ? `@${item.talent.username}` : "Talent"} ·{" "}
            {item.years_experience === 0 ? "Beginner" : `${item.years_experience} yrs exp`}
            {item.age ? ` · ${item.age} ${GENDER_LABELS[item.gender] ?? ""}` : ""} · {town}
          </p>
        </div>
      </div>

      {videos.length > 0 ? (
        <div className="mt-3 flex gap-2">
          {videos.slice(0, 3).map((video, index) => (
            <VideoThumb key={video.p} video={video} onClick={() => onWatch(index)} />
          ))}
        </div>
      ) : null}

      <p className="mt-3 line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">{item.description}</p>

      {item.skills.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.skills.slice(0, 5).map((skill) => (
            <Badge key={skill} variant="secondary" className="rounded-full text-[11px] font-normal">
              {skill}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3 text-[11px]">
        {item.face_verified ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-1 font-medium text-success">
            <ScanFace className="size-3" /> Face Verified
          </span>
        ) : null}
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-medium",
            isAvailable ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground",
          )}
        >
          <span className={cn("size-1.5 rounded-full", isAvailable ? "bg-success" : "bg-muted-foreground")} />
          {availabilityLabel}
        </span>
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <MapPin className="size-3" />
          {item.landmark ? `${item.landmark}, ` : ""}
          {item.region ?? item.location_name}
        </span>
      </div>

      <Button
        className="mt-4 h-11 w-full rounded-full font-semibold"
        disabled={busy || isMine}
        onClick={onEmploy}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : isMine ? (
          "Your listing"
        ) : unlocked ? (
          <>
            <ShieldCheck className="mr-2 size-4" /> Employ for ¢{EMPLOY_FEE}
          </>
        ) : (
          <>
            <Lock className="mr-2 size-4" /> Employ for ¢{EMPLOY_FEE}
          </>
        )}

      </Button>
    </li>
  );
}

function VideoThumb({ video, onClick }: { video: TalentVideo; onClick: () => void }) {
  const [poster, setPoster] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void signedTalentUrl(video.t).then((url) => active && setPoster(url));
    return () => {
      active = false;
    };
  }, [video.t]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative h-10 w-[60px] shrink-0 overflow-hidden rounded-md border border-white/10 bg-secondary"
      aria-label="Watch proof video"
    >
      {poster ? (
        <img src={poster} alt="" loading="lazy" className="size-full object-cover" />
      ) : null}
      <span className="absolute inset-0 flex items-center justify-center bg-black/35">
        <Play className="size-3.5 fill-white text-white" />
      </span>
      {video.d ? (
        <span className="absolute bottom-0 right-0 bg-black/70 px-1 text-[9px] font-medium text-white">
          {formatClock(video.d)}
        </span>
      ) : null}
    </button>
  );
}
