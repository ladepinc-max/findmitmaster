import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRole } from "@/lib/roles";
import { updatePrice, useAllPrices } from "@/lib/pricing";

/** Admin-only list of in-app fees with editable GHS amounts. */
export function PricingSection() {
  const { isAdmin } = useRole();
  const { prices, reload } = useAllPrices();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(Object.fromEntries(prices.map((p) => [p.key, String(p.amount)])));
  }, [prices]);

  if (!isAdmin) return null;

  const save = async () => {
    setSaving(true);
    try {
      for (const p of prices) {
        const next = Number(draft[p.key]);
        if (!Number.isFinite(next) || next < 0) throw new Error(`Invalid amount for ${p.label}`);
        if (Math.round(next) !== p.amount) await updatePrice(p.key, Math.round(next));
      }
      toast.success("Prices saved");
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save prices");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="px-6 pb-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Payment Pricing Control
      </h2>
      <div className="mt-3 space-y-3 rounded-xl border border-border bg-surface p-4">
        {prices.map((p) => (
          <label key={p.key} className="flex items-center justify-between gap-4 text-sm">
            <span className="font-medium">{p.label}</span>
            <span className="flex items-center gap-2">
              <span className="text-muted-foreground">GHS</span>
              <Input
                type="number"
                min={0}
                className="w-24"
                value={draft[p.key] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [p.key]: e.target.value }))}
              />
            </span>
          </label>
        ))}
        <Button className="w-full" onClick={save} disabled={saving || prices.length === 0}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </section>
  );
}
