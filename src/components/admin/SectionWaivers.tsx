import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type Row = { key: string; label: string; amount: number; is_waived: boolean };

const NAMES: Record<string, string> = {
  job_post: "Post jobs",
  job_apply: "Apply for jobs",
  talent_post: "Post talent",
  talent_employ: "Employ talent",
  classroom_raise: "Raise hand in live class",
  tutor_monthly: "AI tutor (Practice + Ask Ama)",
  shop_registration: "Shop registration (yearly)",
};

const table = () => (supabase as unknown as { from: (t: string) => any }).from("app_pricing");

/** Admin only: tick a paid section and tap Update to make it free for every user. */
export function SectionWaivers() {
  const [rows, setRows] = useState<Row[]>([]);
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await table().select("key, label, amount, is_waived").order("key");
    const list = (data ?? []) as Row[];
    setRows(list);
    setDraft(Object.fromEntries(list.map((r) => [r.key, r.is_waived])));
  };
  useEffect(() => {
    void load();
  }, []);

  const update = async () => {
    setSaving(true);
    try {
      for (const r of rows) {
        if (Boolean(draft[r.key]) !== r.is_waived) {
          const { error } = await table().update({ is_waived: Boolean(draft[r.key]) }).eq("key", r.key);
          if (error) throw error;
        }
      }
      toast.success("Free sections updated");
      await load();
    } catch {
      toast.error("Could not update free sections");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-6 rounded-2xl border border-border bg-surface p-4">
      <h2 className="font-display text-sm font-bold">Free for everyone</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Tick a section and tap Update to make it free for all users. Untick to charge again.
      </p>
      <div className="mt-3 divide-y divide-border">
        {rows.map((r) => (
          <label key={r.key} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span>
              {NAMES[r.key] ?? r.label}
              <span className="ml-2 text-xs text-muted-foreground">¢{r.amount}</span>
            </span>
            <Checkbox
              checked={Boolean(draft[r.key])}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, [r.key]: v === true }))}
            />
          </label>
        ))}
      </div>
      <Button className="mt-3 w-full" disabled={saving} onClick={() => void update()}>
        {saving ? "Updating…" : "Update"}
      </Button>
    </section>
  );
}
