import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { BadgeCheck, Bookmark, Building2, Crown, Loader2, MapPin, Navigation, Users } from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { daysUntilExpiry, formatMoney, type Job } from "@/lib/jobs";
import { useAppPrice } from "@/lib/pricing";
import { signedUrl } from "@/lib/community-map";

import { cn } from "@/lib/utils";

const JOB_TYPE_LABELS: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  remote: "Remote",
  on_site: "On-site",
};

function useShopPhoto(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void signedUrl("community-photos", path ?? null).then((u) => active && setUrl(u));
    return () => {
      active = false;
    };
  }, [path]);
  return url;
}

export function JobCard({
  job,
  busy,
  isMine,
  saved,
  onApply,
  onToggleSave,
}: {
  job: Job;
  busy: boolean;
  isMine: boolean;
  saved: boolean;
  onApply: () => void;
  onToggleSave: () => void;
}) {
  const { amount: APPLY_FEE } = useAppPrice("job_apply");
  const [expanded, setExpanded] = useState(false);
  const [details, setDetails] = useState(false);
  const lastTap = useRef(0);
  const navigate = useNavigate();
  const photo = useShopPhoto(job.shop_photo_path);
  const hasPin = job.location_lat != null && job.location_lng != null;

  const chips = [
    JOB_TYPE_LABELS[job.job_type] ?? job.job_type,
    job.category,
    `${job.vacancies} ${job.vacancies === 1 ? "vacancy" : "vacancies"}`,
    job.gender_requirement === "any" ? "Any gender" : job.gender_requirement,
    job.age_min || job.age_max ? `Age ${job.age_min ?? "any"}–${job.age_max ?? "any"}` : null,
  ].filter(Boolean) as string[];

  const directions = () => {
    if (!hasPin) return;
    void navigate({
      to: "/l",
      search: { lat: job.location_lat!, lng: job.location_lng!, label: job.location_name, landmark: job.company },
    });
  };

  const onTap = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const now = Date.now();
    if (now - lastTap.current < 350) setDetails(true);
    lastTap.current = now;
  };

  const shopBlock = (big: boolean) => (
    <div className="mt-3 overflow-hidden rounded-xl border border-border">
      {photo ? (
        <img src={photo} alt={`${job.location_name} shop front`} className={cn("w-full object-cover", big ? "h-56" : "h-36")} />
      ) : null}
      {big && hasPin ? (
        <iframe
          title="Shop location"
          className="h-40 w-full border-0"
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${job.location_lng! - 0.003},${job.location_lat! - 0.002},${job.location_lng! + 0.003},${job.location_lat! + 0.002}&layer=mapnik&marker=${job.location_lat},${job.location_lng}`}
        />
      ) : null}
      <div className="flex items-center justify-between gap-2 p-2.5">
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" /> <span className="truncate">{job.location_name}</span>
        </p>
        {hasPin ? (
          <Button size="sm" variant="secondary" className="h-8 shrink-0 rounded-full" onClick={directions}>
            <Navigation className="mr-1 size-3.5" /> Directions
          </Button>
        ) : null}
      </div>
    </div>
  );

  return (
    <li className="card-premium relative select-none p-5" onClick={onTap}>
      {job.is_featured ? (
        <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-gold px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-gold-foreground">
          <Crown className="size-3" /> Featured
        </span>
      ) : null}

      <div className="flex items-start gap-3 pr-20">
        <UserAvatar profile={job.employer} className="size-12 shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold leading-tight">{job.title}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Building2 className="size-3.5 shrink-0" />
            <span className="truncate">{job.company}</span>
            {job.employer?.is_verified ? <BadgeCheck className="size-3.5 shrink-0 text-accent" /> : null}
          </p>
        </div>
      </div>

      <p className="mt-3 text-base font-bold text-primary">
        {formatMoney(job.salary_amount, job.salary_currency, job.salary_period)}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <span
            key={chip}
            className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium capitalize text-foreground"
          >
            {chip}
          </span>
        ))}
      </div>

      {shopBlock(false)}

      <p className={cn("mt-3 whitespace-pre-line text-sm text-muted-foreground", !expanded && "line-clamp-2")}>
        {job.description}
      </p>
      {job.description.length > 110 ? (
        <button
          type="button"
          className="mt-1 text-xs font-semibold text-accent"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      ) : null}

      {job.skills.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {job.skills.map((skill) => (
            <Badge key={skill} variant="outline" className="rounded-full">
              {skill}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Users className="size-3.5" />
          {job.applicants_count === 0
            ? "Be the first to apply"
            : `${job.applicants_count} ${job.applicants_count === 1 ? "person" : "people"} applied`}
        </span>
        {(() => {
          const days = daysUntilExpiry(job.expires_at);
          return days !== null && days > 0 ? (
            <Badge variant="secondary" className="rounded-full text-[11px] font-normal">
              Expires in {days} days
            </Badge>
          ) : null;
        })()}
        <span className="text-[11px]">· Double-tap for full details</span>
      </div>

      <div className="mt-4 flex gap-2">
        <Button
          variant="outline"
          className="h-11 rounded-full px-4"
          aria-label={saved ? "Remove from saved" : "Save job"}
          onClick={onToggleSave}
        >
          <Bookmark className={cn("size-4", saved && "fill-current text-primary")} />
          <span className="ml-2 text-sm">{saved ? "Saved" : "Save"}</span>
        </Button>
        <Button className="h-11 flex-1 rounded-full font-semibold" disabled={busy || isMine} onClick={onApply}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : isMine ? "Your listing" : `Apply for ¢${APPLY_FEE}`}
        </Button>
      </div>

      <Dialog open={details} onOpenChange={setDetails}>
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-3xl" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>{job.title}</DialogTitle>
            <DialogDescription>
              {job.company} · {formatMoney(job.salary_amount, job.salary_currency, job.salary_period)}
            </DialogDescription>
          </DialogHeader>
          {shopBlock(true)}
          <div className="flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <span key={chip} className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium capitalize">
                {chip}
              </span>
            ))}
          </div>
          <p className="whitespace-pre-line text-sm text-muted-foreground">{job.description}</p>
          {job.skills.length ? (
            <div className="flex flex-wrap gap-1.5">
              {job.skills.map((s) => (
                <Badge key={s} variant="outline" className="rounded-full">
                  {s}
                </Badge>
              ))}
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Posted {new Date(job.created_at).toLocaleDateString()} · {job.applicants_count} applied
          </p>
          <Button className="h-11 w-full rounded-full font-semibold" disabled={busy || isMine} onClick={onApply}>
            {isMine ? "Your listing" : `Apply for ¢${APPLY_FEE}`}
          </Button>
        </DialogContent>
      </Dialog>
    </li>
  );
}
