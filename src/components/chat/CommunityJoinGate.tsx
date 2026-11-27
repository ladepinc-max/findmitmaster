import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export function CommunityJoinGate({ name, lockedUntil, error, busy, onJoin }: { name: string; lockedUntil: string | null; error: string | null; busy: boolean; onJoin: () => void }) {
  const [confirmed, setConfirmed] = useState(false);
  return <section className="mx-auto flex max-w-sm flex-col gap-4 px-5 py-10">
    <h2 className="font-display text-xl font-bold">Join {name}</h2>
    <p className="text-sm text-muted-foreground">You can only join one community chat at a time. You can switch to another community after six months from joining. Public news comments remain open.</p>
    {lockedUntil ? <p className="text-sm font-semibold text-destructive">You already belong to another community. You can switch on {new Date(lockedUntil).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.</p> : <label className="flex items-start gap-3 text-sm"><Checkbox checked={confirmed} onCheckedChange={(value) => setConfirmed(value === true)} /><span>I confirm that I am a member of {name}.</span></label>}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <Button onClick={onJoin} disabled={busy || !confirmed || !!lockedUntil}>{busy ? "Joining…" : "Confirm & join community"}</Button>
  </section>;
}