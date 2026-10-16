import { useCallback, useEffect, useState } from "react";
import {
  BadgeCheck,
  Check,
  Copy,
  IdCard,
  Loader2,
  Lock,
  Phone,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { copyFindmitId, findmitId } from "@/lib/user-id";
import { toast } from "sonner";
import { UserAvatar } from "@/components/UserAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { fetchTalentContact, maskPhone, type TalentContact } from "@/lib/hiring";
import { formatMoney, type TalentProfile } from "@/lib/jobs";
import { useAppPrice } from "@/lib/pricing";
import { cn } from "@/lib/utils";

interface Props {
  talent: TalentProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  email: string;
  unlocked: boolean;
  onUnlocked: (talentProfileId: string) => void;
  onEmploy: (talent: TalentProfile) => void;
  employing: boolean;
  onPostJob: () => void;
}

const PAYMENT_METHODS = ["MTN MoMo", "Vodafone Cash", "AirtelTigo Money", "Card"];

export function ContactPaywall({
  talent,
  open,
  onOpenChange,
  userId,
  email,
  unlocked,
  onUnlocked,
  onEmploy,
  employing,
  onPostJob,
}: Props) {
  const { amount: JOB_POST_FEE } = useAppPrice("job_post");
  const { amount: EMPLOY_FEE } = useAppPrice("talent_employ");
  const [contact, setContact] = useState<TalentContact | null>(null);

  const refresh = useCallback(async () => {
    if (!talent) return;
    try {
      if (unlocked) setContact(await fetchTalentContact(talent.id));
      else setContact(null);
    } catch (error) {
      console.error(error);
    }
  }, [talent, unlocked]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  if (!talent) return null;

  const phone = contact?.phone ?? null;
  const talentUserId = contact?.user_id ?? talent.talent?.id ?? null;
  const talentCode = talentUserId ? findmitId(talentUserId) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-3xl border-border bg-card p-0">
        <div className="relative overflow-hidden rounded-t-3xl px-5 pb-4 pt-6">
          {!unlocked ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 scale-110 opacity-25 blur-2xl brand-gradient-bg"
            />
          ) : null}
          <SheetHeader className="relative p-0 text-left">
            <div className="flex items-center gap-3">
              <UserAvatar profile={talent.talent} className={cn("size-12", !unlocked && "blur-[2px]")} />
              <div className="min-w-0">
                <SheetTitle className="truncate text-base">{talent.expertise}</SheetTitle>
                <SheetDescription className="truncate">
                  {talent.talent ? `@${talent.talent.username}` : "Talent"} ·{" "}
                  {formatMoney(talent.rate_amount, talent.rate_currency, talent.rate_period)}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
        </div>

        <div className="space-y-4 px-5 pb-8">
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Contact details</p>
              {unlocked ? (
                <Badge className="gap-1 border-0 bg-success/15 text-success">
                  <ShieldCheck className="size-3" /> Unlocked
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <Lock className="size-3" /> Locked
                </Badge>
              )}
            </div>

            <div className="mt-3 space-y-2 text-sm">
              <Row
                icon={Phone}
                label="Phone"
                value={unlocked ? (phone ?? "Not provided") : maskPhone(phone)}
                locked={!unlocked}
              />
              <Row
                icon={IdCard}
                label="FindMit ID"
                value={unlocked ? (talentCode ?? "Not available") : "FM-••••••••"}
                locked={!unlocked}
                onClick={unlocked && talentCode ? () => void copyFindmitId(talentCode) : undefined}
              />
            </div>

            {unlocked ? (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button
                  className="bg-wa-green text-white hover:bg-wa-green-dark"
                  disabled={!talentCode}
                  onClick={() => void copyFindmitId(talentCode ?? "")}
                >
                  <Copy className="mr-2 size-4" /> Copy FindMit ID
                </Button>
                <Button variant="secondary" disabled={!phone} onClick={() => (window.location.href = `tel:${phone}`)}>
                  <Phone className="mr-2 size-4" /> Call
                </Button>
              </div>
            ) : null}
          </div>

          {!unlocked ? (
            <>
              <div>
                <h3 className="font-display text-lg font-bold">Phone number is private</h3>
                <p className="text-sm text-muted-foreground">
                  Contact details open up once you have posted a job on FindMit.
                </p>
              </div>

              <Button className="h-12 w-full rounded-full font-semibold" onClick={onPostJob}>
                <Lock className="mr-2 size-4" /> Post a Job for GHS {JOB_POST_FEE} to Unlock
              </Button>

              <div className="flex flex-wrap items-center gap-1.5">
                {PAYMENT_METHODS.map((method) => (
                  <Badge key={method} variant="secondary" className="gap-1 text-[11px]">
                    <Check className="size-3" /> {method}
                  </Badge>
                ))}
              </div>
            </>
          ) : null}

          <Button
            variant={unlocked ? "secondary" : "default"}
            className="w-full"
            disabled={employing}
            onClick={() => onEmploy(talent)}
          >
            {employing ? <Loader2 className="mr-2 size-4 animate-spin" /> : <BadgeCheck className="mr-2 size-4" />}
            Employ for ¢{EMPLOY_FEE} & start chat

          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({
  icon: Icon,
  label,
  value,
  locked,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  locked: boolean;
  onClick?: (() => void) | undefined;
}) {
  return (
    <div
      className={cn("flex items-center justify-between gap-3", onClick && "cursor-pointer")}
      onClick={onClick}
    >
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" /> {label}
      </span>
      <span className={cn("flex items-center gap-1.5 font-medium", locked && "text-muted-foreground")}>
        {locked ? <Lock className="size-3.5" /> : null}
        <span className={cn(locked && "blur-[3px] select-none")}>{value}</span>
      </span>
    </div>
  );
}
