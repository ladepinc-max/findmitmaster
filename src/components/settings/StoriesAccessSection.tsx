import { useCallback, useEffect, useState } from "react";
import { Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { useAppSections } from "@/lib/app-sections";
import { findUserByHandle } from "@/lib/free-access";
import { findmitId } from "@/lib/user-id";

interface Tester {
  user_id: string;
  username: string | null;
}

/** Admin only: private Stories testers + the Publish-to-all switch. */
export function StoriesAccessSection() {
  const { user } = useAuth();
  const { sections } = useAppSections();
  const [testers, setTesters] = useState<Tester[]>([]);
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const published = sections["stories_tab"] ? !sections["stories_tab"].is_hidden : false;

  const load = useCallback(async () => {
    const { data } = await supabase.from("stories_testers" as never).select("user_id");
    const ids = ((data ?? []) as { user_id: string }[]).map((r) => r.user_id);
    if (!ids.length) return setTesters([]);
    const { data: profs } = await supabase.from("profiles").select("id, username").in("id", ids);
    setTesters(ids.map((id) => ({ user_id: id, username: profs?.find((p) => p.id === id)?.username ?? null })));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setPublished = async (value: boolean) => {
    if (value && !confirm("Make the Stories tab visible to ALL users now?")) return;
    setBusy(true);
    const { error } = await supabase
      .from("app_sections")
      .update({ is_hidden: !value })
      .eq("id", "stories_tab");
    setBusy(false);
    if (error) toast.error("Could not change Stories");
    else toast.success(value ? "Stories is now live for everyone" : "Stories is private again");
  };

  const add = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const target = await findUserByHandle(handle);
      if (!target) return void toast.error("No user with that username or FindMit ID");
      const { error } = await supabase
        .from("stories_testers" as never)
        .upsert({ user_id: target.id, added_by: user.id } as never);
      if (error) throw error;
      toast.success(`@${target.username ?? findmitId(target.id)} can now see Stories`);
      setHandle("");
      await load();
    } catch {
      toast.error("Could not save");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    await supabase.from("stories_testers" as never).delete().eq("user_id", id);
    await load();
  };

  return (
    <section className="px-6 pb-6">
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Play className="size-3.5" /> Stories access (admin)
      </h2>
      <div className="mt-3 space-y-3 rounded-xl border border-border bg-surface px-4 py-3">
        <p className="text-sm">
          Status: <b>{published ? "Live for everyone" : "Private — admins & testers only"}</b>
        </p>
        <Button
          className="w-full"
          variant={published ? "outline" : "default"}
          disabled={busy}
          onClick={() => void setPublished(!published)}
        >
          {published ? "Hide from public (private mode)" : "Publish Stories to all"}
        </Button>

        <div className="flex gap-2">
          <Input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="Username or FindMit ID" />
          <Button disabled={busy || !handle.trim()} onClick={() => void add()}>
            Add
          </Button>
        </div>
        {testers.length === 0 ? (
          <p className="text-xs text-muted-foreground">No tester accounts yet.</p>
        ) : (
          <ul className="space-y-1">
            {testers.map((t) => (
              <li key={t.user_id} className="flex items-center justify-between text-sm">
                <span>@{t.username ?? findmitId(t.user_id)}</span>
                <button aria-label="Remove" onClick={() => void remove(t.user_id)} className="text-destructive">
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
