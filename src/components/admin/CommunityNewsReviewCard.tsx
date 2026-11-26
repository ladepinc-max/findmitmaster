import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Newspaper } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/** Admin shortcut to the Community News review queue with a live pending count. */
export function CommunityNewsReviewCard() {
  const [pending, setPending] = useState<number | null>(null);
  useEffect(() => {
    void supabase
      .from("community_news")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .then(({ count }) => setPending(count ?? 0));
  }, []);
  return (
    <Link
      to="/admin/community-news"
      className="mb-4 flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm"
    >
      <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
        <Newspaper className="h-5 w-5" />
      </span>
      <span className="flex-1">
        <span className="block font-semibold">Review Community News</span>
        <span className="block text-xs text-muted-foreground">Approve or reject submitted stories</span>
      </span>
      {pending ? (
        <span className="rounded-full bg-destructive px-2.5 py-0.5 text-xs font-bold text-destructive-foreground">
          {pending}
        </span>
      ) : null}
    </Link>
  );
}
