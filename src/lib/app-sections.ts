import { useCachedState } from "@/lib/page-cache";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const SUPER_ADMIN_EMAIL = "findmitedutech@gmail.com";

export type SectionId =
  | "shs_tv_upload"
  | "jhs_tv_upload"
  | "primary_tv_upload"
  | "vocational_tv_upload"
  | "kids_tv_upload"
  | "go_live_now"
  | "findmit_ghana_tab"
  | "chat_button";

export interface AppSection {
  id: SectionId;
  is_hidden: boolean;
  is_locked: boolean;
}

/** Role rule: the owner email is super_admin, everyone else is a normal user. */
export function useIsSuperAdmin() {
  const { user } = useAuth();
  return (user?.email ?? "").toLowerCase() === SUPER_ADMIN_EMAIL;
}

/** Live map of section visibility/lock flags, shared by every screen. */
export function useAppSections() {
  const [sections, setSections] = useCachedState<Record<string, AppSection>>("app:sections", {}, () => setLoading(false));
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase.from("app_sections").select("id, is_hidden, is_locked");
    const next: Record<string, AppSection> = {};
    for (const row of (data ?? []) as AppSection[]) next[row.id] = row;
    setSections(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase
      // Unique name per hook instance: several screens use this hook at once.
      .channel(`app-sections-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_sections" }, () => {
        void load();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const toggle = useCallback(
    async (id: SectionId, field: "is_hidden" | "is_locked") => {
      const current = sections[id];
      if (!current) return;
      const value = !current[field];
      setSections((prev) => ({ ...prev, [id]: { ...current, [field]: value } }));
      const patch = field === "is_hidden" ? { is_hidden: value } : { is_locked: value };
      const { error } = await supabase.from("app_sections").update(patch).eq("id", id);
      if (error) void load();
    },
    [sections, load],
  );

  return { sections, loading, toggle };
}

export function isVisibleTo(section: AppSection | undefined, isSuperAdmin: boolean) {
  if (isSuperAdmin) return true;
  if (!section) return true;
  return !section.is_hidden;
}

export function isLockedFor(section: AppSection | undefined, isSuperAdmin: boolean) {
  if (isSuperAdmin) return false;
  return Boolean(section?.is_locked);
}
