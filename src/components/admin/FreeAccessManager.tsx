import { useCallback, useEffect, useState } from "react";
import { Gift, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { findmitId } from "@/lib/user-id";
import {
  FREE_FEATURES,
  NO_FREE,
  findUserByHandle,
  listFreeAccess,
  removeFreeAccess,
  saveFreeAccess,
  type FreeAccessRow,
  type FreeFeature,
  type FreeFlags,
} from "@/lib/free-access";

/** Admin only: give chosen users free access to paid sections. */
export function FreeAccessManager() {
  const { user } = useAuth();
  const [rows, setRows] = useState<FreeAccessRow[]>([]);
  const [edits, setEdits] = useState<Record<string, FreeFlags>>({});
  const [handle, setHandle] = useState("");
  const [newFlags, setNewFlags] = useState<FreeFlags>(NO_FREE);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await listFreeAccess());
      setEdits({});
    } catch {
      toast.error("Could not load free access list");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addNew = async () => {
    if (!user) return;
    if (!Object.values(newFlags).some(Boolean)) {
      toast.error("Tick at least one section");
      return;
    }
    setBusy("new");
    try {
      const target = await findUserByHandle(handle);
      if (!target) {
        toast.error("No user with that username or FindMit ID");
        return;
      }
      await saveFreeAccess(target.id, user.id, newFlags);
      toast.success(`Free access saved for @${target.username ?? findmitId(target.id)}`);
      setHandle("");
      setNewFlags(NO_FREE);
      await load();
    } catch {
      toast.error("Could not save");
    } finally {
      setBusy(null);
    }
  };

  const saveRow = async (row: FreeAccessRow) => {
    if (!user) return;
    const flags = edits[row.user_id];
    if (!flags) return;
    setBusy(row.user_id);
    try {
      await saveFreeAccess(row.user_id, user.id, flags);
      toast.success("Saved");
      await load();
    } catch {
      toast.error("Could not save");
    } finally {
      setBusy(null);
    }
  };

  const removeRow = async (row: FreeAccessRow) => {
    if (!confirm("Remove all free access for this user?")) return;
    setBusy(row.user_id);
    try {
      await removeFreeAccess(row.user_id);
      toast.success("Free access removed");
      await load();
    } catch {
      toast.error("Could not remove");
    } finally {
      setBusy(null);
    }
  };

  const flagsOf = (row: FreeAccessRow): FreeFlags => edits[row.user_id] ?? row;
  const toggle = (row: FreeAccessRow, key: FreeFeature, on: boolean) =>
    setEdits((prev) => ({ ...prev, [row.user_id]: { ...pick(flagsOf(row)), [key]: on } }));

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 font-display text-sm font-bold">
        <Gift className="size-4 text-primary" /> Free app access (admin)
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Enter a username or FindMit ID, tick the sections, then Save. They won't pay for those sections.
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2 pr-2 font-semibold">FindMit ID / username</th>
              {FREE_FEATURES.map((f) => (
                <th key={f.key} className="px-1 py-2 text-center font-semibold">{f.label}</th>
              ))}
              <th className="py-2 pl-2" />
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border bg-muted/40">
              <td className="py-2 pr-2">
                <Input
                  value={handle}
                  placeholder="@username or FM-XXXXXXXX"
                  onChange={(e) => setHandle(e.target.value)}
                  className="h-8 text-xs"
                />
              </td>
              {FREE_FEATURES.map((f) => (
                <td key={f.key} className="px-1 text-center">
                  <Checkbox
                    checked={newFlags[f.key]}
                    onCheckedChange={(v) => setNewFlags((p) => ({ ...p, [f.key]: v === true }))}
                    aria-label={f.label}
                  />
                </td>
              ))}
              <td className="pl-2">
                <Button size="sm" disabled={!handle.trim() || busy === "new"} onClick={() => void addNew()}>
                  {busy === "new" ? <Loader2 className="size-4 animate-spin" /> : "Save"}
                </Button>
              </td>
            </tr>
            {rows.map((row) => {
              const flags = flagsOf(row);
              const dirty = Boolean(edits[row.user_id]);
              return (
                <tr key={row.user_id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-2">
                    <p className="font-semibold">@{row.profile?.username ?? "unknown"}</p>
                    <p className="text-muted-foreground">{findmitId(row.user_id)}</p>
                  </td>
                  {FREE_FEATURES.map((f) => (
                    <td key={f.key} className="px-1 text-center">
                      <Checkbox
                        checked={flags[f.key]}
                        onCheckedChange={(v) => toggle(row, f.key, v === true)}
                        aria-label={`${f.label} for ${row.profile?.username ?? row.user_id}`}
                      />
                    </td>
                  ))}
                  <td className="whitespace-nowrap pl-2">
                    <Button
                      size="sm"
                      variant={dirty ? "default" : "outline"}
                      disabled={!dirty || busy === row.user_id}
                      onClick={() => void saveRow(row)}
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Remove free access"
                      disabled={busy === row.user_id}
                      onClick={() => void removeRow(row)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">No one has free access yet.</p>
        ) : null}
      </div>
    </section>
  );
}

function pick(f: FreeFlags): FreeFlags {
  return {
    classroom_raise: f.classroom_raise,
    jobs_contact: f.jobs_contact,
    jobs_post: f.jobs_post,
    talent_post: f.talent_post,
    tutor_unlimited: f.tutor_unlimited,
  };
}
