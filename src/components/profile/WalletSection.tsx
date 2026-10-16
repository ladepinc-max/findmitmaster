import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { FREE_FEATURES, type FreeFeature } from "@/lib/free-access";
import { payWithPaystack } from "@/lib/paystack";
import { activateWalletPackage } from "@/lib/wallet.functions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (t: string) => (supabase as unknown as { from: (t: string) => any }).from(t);

interface Pkg {
  id: string;
  title: string;
  amount: number;
  duration_days: number;
  areas: string[];
  is_active: boolean;
}
interface Pass {
  id: string;
  title: string;
  areas: string[];
  expires_at: string;
}

const label = (a: string) => FREE_FEATURES.find((f) => f.key === a)?.label ?? a;
const durationText = (d: number) =>
  d % 30 === 0 ? `${d / 30} month${d === 30 ? "" : "s"}` : d % 7 === 0 ? `${d / 7} week${d === 7 ? "" : "s"}` : `${d} day${d === 1 ? "" : "s"}`;

async function loadPackages(all: boolean): Promise<Pkg[]> {
  let q = db("wallet_packages").select("*").order("amount", { ascending: true });
  if (!all) q = q.eq("is_active", true);
  const { data } = await q;
  return (data ?? []) as Pkg[];
}

/** Student view: active wallet status + dropdown of admin packages + pay. */
export function WalletFund() {
  const { user, session } = useAuth();
  const activate = useServerFn(activateWalletPackage);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [passes, setPasses] = useState<Pass[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setPackages(await loadPackages(false));
    if (!user) return;
    const { data } = await db("wallet_passes")
      .select("id, title, areas, expires_at")
      .eq("user_id", user.id)
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: false });
    setPasses((data ?? []) as Pass[]);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const pkg = packages.find((p) => p.id === selected);

  const fund = async () => {
    if (!user || !pkg) return;
    setBusy(true);
    const reference = `fm_wallet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      const paid = await payWithPaystack({
        email: session?.user.email ?? "",
        amount: Number(pkg.amount),
        reference,
        userId: user.id,
        metadata: { kind: "wallet", package_id: pkg.id },
      });
      if (!paid) return;
      const res = await activate({ data: { packageId: pkg.id, reference } });
      toast.success(`Wallet funded — active until ${new Date(res.expiresAt).toLocaleDateString()}`);
      setSelected("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not fund wallet");
    } finally {
      setBusy(false);
    }
  };

  const until = passes[0]?.expires_at;
  const areas = Array.from(new Set(passes.flatMap((p) => p.areas)));

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 font-display text-sm font-bold">
        <Wallet className="size-4 text-primary" /> FindMit Wallet
      </h2>
      {until ? (
        <div className="mt-2 rounded-xl bg-primary/10 p-3 text-xs">
          <p className="font-semibold">Active until {new Date(until).toLocaleDateString()}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {areas.map((a) => (
              <span key={a} className="rounded-full bg-primary px-2 py-0.5 text-primary-foreground">{label(a)}</span>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">No active package. Fund your wallet to save on fees.</p>
      )}

      {packages.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">No packages available yet.</p>
      ) : (
        <>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            aria-label="Choose a wallet package"
            className="mt-3 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
          >
            <option value="">Tap to choose a package…</option>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>
                GHS {Number(p.amount)} · {p.title} · {durationText(p.duration_days)} · {p.areas.map(label).join(", ")}
              </option>
            ))}
          </select>
          {pkg ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {durationText(pkg.duration_days)} of: {pkg.areas.map(label).join(", ") || "—"}
            </p>
          ) : null}
          <Button className="mt-3 w-full" disabled={!pkg || busy} onClick={() => void fund()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : pkg ? `Fund GHS ${Number(pkg.amount)}` : "Fund wallet"}
          </Button>
        </>
      )}
    </section>
  );
}

type Draft = Omit<Pkg, "id"> & { id?: string };
const EMPTY: Draft = { title: "", amount: 0, duration_days: 30, areas: [], is_active: true };

/** Admin only: table of wallet packages (amount, duration, areas covered). */
export function WalletPackagesAdmin() {
  const [rows, setRows] = useState<Draft[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => setRows(await loadPackages(true)), []);
  useEffect(() => {
    void load();
  }, [load]);

  const update = (i: number, patch: Partial<Draft>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const save = async (r: Draft, i: number) => {
    if (!(Number(r.amount) > 0) || !(Number(r.duration_days) > 0) || r.areas.length === 0) {
      toast.error("Set amount, duration and at least one area");
      return;
    }
    setBusy(r.id ?? `new${i}`);
    const body = {
      title: r.title.trim() || "Package",
      amount: Number(r.amount),
      duration_days: Math.round(Number(r.duration_days)),
      areas: r.areas,
      is_active: r.is_active,
    };
    const { error } = r.id ? await db("wallet_packages").update(body).eq("id", r.id) : await db("wallet_packages").insert(body);
    setBusy(null);
    if (error) toast.error("Could not save package");
    else {
      toast.success("Package saved");
      void load();
    }
  };

  const remove = async (r: Draft, i: number) => {
    if (!r.id) return setRows((prev) => prev.filter((_, idx) => idx !== i));
    if (!confirm("Delete this package? Students who already paid keep their access.")) return;
    const { error } = await db("wallet_packages").delete().eq("id", r.id);
    if (error) toast.error("Could not delete");
    else void load();
  };

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-sm font-bold">
          <Wallet className="size-4 text-primary" /> Wallet packages (admin)
        </h2>
        <Button size="sm" variant="outline" onClick={() => setRows((p) => [...p, { ...EMPTY }])}>
          <Plus className="mr-1 size-4" /> Add
        </Button>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[760px] text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2 pr-2">Name</th>
              <th className="px-1 py-2">Amount (GHS)</th>
              <th className="px-1 py-2">Duration (days)</th>
              <th className="px-1 py-2">Areas covered</th>
              <th className="px-1 py-2">On</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id ?? `new${i}`} className="border-b border-border align-top last:border-0">
                <td className="py-2 pr-2">
                  <Input className="h-8 text-xs" value={r.title} placeholder="Monthly pass" onChange={(e) => update(i, { title: e.target.value })} />
                </td>
                <td className="px-1 py-2">
                  <Input className="h-8 w-20 text-xs" type="number" min={1} value={r.amount || ""} onChange={(e) => update(i, { amount: Number(e.target.value) })} />
                </td>
                <td className="px-1 py-2">
                  <Input className="h-8 w-20 text-xs" type="number" min={1} value={r.duration_days || ""} onChange={(e) => update(i, { duration_days: Number(e.target.value) })} />
                </td>
                <td className="px-1 py-2">
                  <div className="grid gap-1">
                    {FREE_FEATURES.map((f) => (
                      <label key={f.key} className="flex items-center gap-1.5">
                        <Checkbox
                          checked={r.areas.includes(f.key)}
                          onCheckedChange={(v) =>
                            update(i, {
                              areas: v === true ? [...r.areas, f.key] : r.areas.filter((a) => a !== (f.key as FreeFeature)),
                            })
                          }
                        />
                        {f.label}
                      </label>
                    ))}
                  </div>
                </td>
                <td className="px-1 py-2">
                  <Switch checked={r.is_active} onCheckedChange={(v) => update(i, { is_active: v })} aria-label="Active" />
                </td>
                <td className="whitespace-nowrap py-2 pl-1">
                  <Button size="sm" disabled={busy === (r.id ?? `new${i}`)} onClick={() => void save(r, i)}>Save</Button>
                  <Button size="sm" variant="ghost" aria-label="Delete package" onClick={() => void remove(r, i)}>
                    <Trash2 className="size-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="mt-3 text-xs text-muted-foreground">No packages yet — tap Add.</p> : null}
      </div>
    </section>
  );
}
