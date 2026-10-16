import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, Lock } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  fetchMyContactPrefs,
  updateMyContactPrefs,
  type ContactAudience,
  type ContactPrefs,
} from "@/lib/contact-privacy";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ContactAudience; label: string }[] = [
  { value: "approved", label: "Only people I allow" },
  { value: "friends", label: "Friends" },
  { value: "public", label: "Everyone" },
];

function Row({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ContactAudience;
  onChange: (next: ContactAudience) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <p className="text-sm font-medium">{label}</p>
      <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-secondary p-1">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors",
              value === option.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ContactPrivacySection() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<ContactPrefs | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void fetchMyContactPrefs(user.id).then((value) => {
      if (active) setPrefs(value);
    });
    return () => {
      active = false;
    };
  }, [user]);

  if (!user || !prefs) return null;

  const save = (patch: Partial<{ show_phone_to: ContactAudience; show_email_to: ContactAudience }>) => {
    const next: ContactPrefs = {
      ...prefs,
      showPhoneTo: patch.show_phone_to ?? prefs.showPhoneTo,
      showEmailTo: patch.show_email_to ?? prefs.showEmailTo,
    };
    setPrefs(next);
    void updateMyContactPrefs(user.id, patch)
      .then(() => toast.success("Privacy updated"))
      .catch(() => {
        setPrefs(prefs);
        toast.error("Could not save that. Please try again.");
      });
  };

  return (
    <section className="px-6 pb-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Contact privacy
      </h2>
      <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Lock className="size-3.5" /> Your number and email stay hidden until you allow someone.
      </p>

      <div className="mt-3 space-y-3">
        <div className="rounded-xl border border-border bg-surface px-4 py-3">
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="text-muted-foreground">My number</span>
            <span className="flex items-center gap-1.5 font-medium">
              {prefs.phoneNumber ? `+${prefs.phoneNumber}` : "Not added"}
              {prefs.phoneVerified ? <BadgeCheck className="size-4 text-success" /> : null}
            </span>
          </div>
        </div>

        <Row
          label="Who can see my number"
          value={prefs.showPhoneTo}
          onChange={(next) => save({ show_phone_to: next })}
        />
        <Row
          label="Who can see my email"
          value={prefs.showEmailTo}
          onChange={(next) => save({ show_email_to: next })}
        />
      </div>
    </section>
  );
}
