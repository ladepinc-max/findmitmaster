import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { browserNotify } from "@/lib/chat-notifications";

/** App-wide: when a class this student joined ends, Ama pings them to open Chat. */
export function AmaClassEndListener({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    const channel = supabase
      .channel(`ama-class-end-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_classes" }, async (p) => {
        const row = p.new as { id: string; is_live?: boolean; topic?: string };
        const old = p.old as { is_live?: boolean };
        if (row.is_live !== false || old.is_live === false) return;
        const { data } = await supabase
          .from("class_enrollments")
          .select("class_id")
          .eq("class_id", row.id)
          .eq("user_id", userId)
          .maybeSingle();
        if (!data || window.location.pathname === "/chat") return;
        const text = `Class on "${row.topic ?? "today's topic"}" ended. Did you understand?`;
        browserNotify("Ama · WASSCE Tutor", "text");
        toast(`Ama: ${text}`, {
          duration: 15000,
          action: { label: "Reply", onClick: () => void navigate({ to: "/chat", search: { c: undefined } }) },
        });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, navigate]);

  void pathname;
  return null;
}
