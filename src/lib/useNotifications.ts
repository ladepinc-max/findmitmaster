import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  enablePush,
  fetchSkippedClassIds,
  loadPrefs,
  notifyLiveClass,
  skipClass,
  syncPrefs,
} from "@/lib/NotificationService";

/**
 * Push notifications are the default mode: on login we register the worker,
 * ask for permission, load saved preferences, and listen for live classes.
 */
export function useNotifications(userId: string | null | undefined) {
  const skipped = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;
    let active = true;

    void enablePush(userId);
    void syncPrefs(userId);
    void fetchSkippedClassIds(userId).then((ids) => {
      if (active) skipped.current = new Set(ids);
    });

    // "Skip class" tapped inside a notification.
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; classId?: string; url?: string };
      if (data?.type === "findmit-skip-class" && data.classId) {
        skipped.current.add(data.classId);
        void skipClass(userId, data.classId);
      }
      if (data?.type === "findmit-open" && data.url) {
        window.location.assign(data.url);
      }
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);

    const channel = supabase
      .channel(`live-class-alerts-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_classes" },
        (payload) => {
          const row = payload.new as
            | { id?: string; host_id?: string; topic?: string; is_live?: boolean }
            | null;
          if (!row?.id || !row.is_live) return;
          if (row.host_id === userId) return;
          if (skipped.current.has(row.id)) return;
          if (!loadPrefs().liveEnabled) return;
          // Only nudge idle students — not people already watching.
          if (typeof document !== "undefined" && document.visibilityState === "visible") {
            if (window.location.pathname.includes(row.id)) return;
          }
          void (async () => {
            const { data } = await supabase
              .from("profiles")
              .select("display_name")
              .eq("id", row.host_id ?? "")
              .maybeSingle();
            await notifyLiveClass({
              classId: row.id!,
              topic: row.topic ?? "A class just started",
              teacherName: (data as { display_name?: string } | null)?.display_name ?? "Your teacher",
            });
          })();
        },
      )
      .subscribe();

    return () => {
      active = false;
      navigator.serviceWorker?.removeEventListener("message", onMessage);
      void supabase.removeChannel(channel);
    };
  }, [userId]);
}
