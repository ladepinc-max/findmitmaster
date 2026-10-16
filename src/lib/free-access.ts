import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { findmitId } from "@/lib/user-id";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (supabase as unknown as { from: (t: string) => any }).from("user_free_access");

export const FREE_FEATURES = [
  { key: "classroom_raise", label: "Raise hands" },
  { key: "jobs_contact", label: "Jobs: apply, employ & contacts" },
  { key: "jobs_post", label: "Post jobs" },
  { key: "talent_post", label: "Post talent" },
  { key: "tutor_unlimited", label: "AI Tutor" },
] as const;

export type FreeFeature = (typeof FREE_FEATURES)[number]["key"];
export type FreeFlags = Record<FreeFeature, boolean>;

export const NO_FREE: FreeFlags = {
  classroom_raise: false,
  jobs_contact: false,
  jobs_post: false,
  talent_post: false,
  tutor_unlimited: false,
};

export interface FreeAccessRow extends FreeFlags {
  user_id: string;
  profile: { username: string | null; display_name: string | null; photo_path: string | null } | null;
}

/** The signed-in user's admin-granted free access, updated live. */
export function useFreeAccess(): FreeFlags {
  const { user } = useAuth();
  const [flags, setFlags] = useState<FreeFlags>(NO_FREE);
  useEffect(() => {
    if (!user) {
      setFlags(NO_FREE);
      return;
    }
    const load = () =>
      void table()
        .select("classroom_raise, jobs_contact, jobs_post, talent_post, tutor_unlimited")
        .eq("user_id", user.id)
        .maybeSingle()
        .then(async ({ data }: { data: FreeFlags | null }) => {
          const next: FreeFlags = { ...NO_FREE, ...(data ? pickFlags(data) : {}) };
          const { data: passes } = await (supabase as unknown as { from: (t: string) => any })
            .from("wallet_passes")
            .select("areas")
            .eq("user_id", user.id)
            .gt("expires_at", new Date().toISOString());
          for (const p of (passes ?? []) as { areas: string[] }[]) {
            for (const a of p.areas) if (a in next) next[a as FreeFeature] = true;
          }
          setFlags(next);
        });
    load();
    const channel = supabase
      .channel(`free-access-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_free_access", filter: `user_id=eq.${user.id}` },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "wallet_passes", filter: `user_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user]);
  return flags;
}

export async function listFreeAccess(): Promise<FreeAccessRow[]> {
  const { data, error } = await table()
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as FreeAccessRow[];
  if (rows.length === 0) return [];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, display_name, photo_path")
    .in("id", rows.map((r) => r.user_id));
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  return rows.map((r) => ({ ...r, profile: byId.get(r.user_id) ?? null }));
}

/** Finds a user by @username or FindMit ID (FM-XXXXXXXX). */
export async function findUserByHandle(input: string) {
  const raw = input.trim();
  if (!raw) return null;
  const fm = raw.toUpperCase().match(/^FM-?([0-9A-F]{8})$/);
  if (fm) {
    const hex = fm[1]!.toLowerCase();
    const { data } = await supabase
      .from("profiles")
      .select("id, username, display_name, photo_path")
      .gte("id", `${hex}-0000-0000-0000-000000000000`)
      .lte("id", `${hex}-ffff-ffff-ffff-ffffffffffff`)
      .limit(2);
    const match = (data ?? []).find((p) => findmitId(p.id) === `FM-${fm[1]}`);
    return match ?? null;
  }
  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, photo_path")
    .eq("username", raw.replace(/^@/, "").toLowerCase())
    .maybeSingle();
  return data ?? null;
}

export async function saveFreeAccess(userId: string, grantedBy: string, flags: FreeFlags) {
  const { error } = await table().upsert({ user_id: userId, granted_by: grantedBy, ...flags });
  if (error) throw error;
}

export async function removeFreeAccess(userId: string) {
  const { error } = await table().delete().eq("user_id", userId);
  if (error) throw error;
}

function pickFlags(f: FreeFlags): FreeFlags {
  return {
    classroom_raise: Boolean(f.classroom_raise),
    jobs_contact: Boolean(f.jobs_contact),
    jobs_post: Boolean(f.jobs_post),
    talent_post: Boolean(f.talent_post),
    tutor_unlimited: Boolean(f.tutor_unlimited),
  };
}
