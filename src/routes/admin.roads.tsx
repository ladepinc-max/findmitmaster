import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CommunityMapView } from "@/components/chat/CommunityMapView";
import { supabase } from "@/integrations/supabase/client";
import { signedUrl, traceToPoints } from "@/lib/community-map";
import { useRole } from "@/lib/roles";

export const Route = createFileRoute("/admin/roads")({
  head: () => ({
    meta: [
      { title: "Road review queue — FindMit admin" },
      { name: "description", content: "FindMit Team review of community roads reported as unhelpful." },
      { property: "og:title", content: "Road review queue — FindMit admin" },
      { property: "og:description", content: "Maintain or close community roads after user reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminRoads,
});

interface Report {
  reason: string | null;
  note: string | null;
  photo: string | null;
  at: string;
}
interface Row {
  id: string;
  trace: unknown;
  builder_name: string | null;
  local_name: string | null;
  source: string;
  path_type: string;
  unhelpful_count: number;
  helpful_count: number;
  reports: Report[];
}

function ReportPhoto({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    void signedUrl("community-photos", path).then(setUrl);
  }, [path]);
  return url ? <img src={url} alt="Reported problem" className="mt-1 max-h-40 rounded-lg" /> : null;
}

function AdminRoads() {
  const { isAdmin, loading } = useRole();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("routes_for_review");
    if (!error) setRows((data ?? []) as unknown as Row[]);
  }, []);

  useEffect(() => {
    if (!loading && !isAdmin) void navigate({ to: "/" });
    if (isAdmin) void load();
  }, [isAdmin, loading, load, navigate]);

  const decide = async (id: string, keep: boolean) => {
    const { error } = await supabase.rpc("review_route", { _route_id: id, _keep: keep });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(keep ? "Road maintained" : "Road closed");
    void load();
  };

  if (!isAdmin) return null;
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-lg font-bold">Roads waiting for FindMit Team review</h1>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">No roads need review right now.</p> : null}
      {rows.map((r) => {
        const pts = traceToPoints(r.trace);
        return (
          <div key={r.id} className="space-y-2 rounded-2xl bg-card p-4 shadow-sm">
            <p className="text-sm font-semibold">
              {r.local_name || "Unnamed road"} · {r.path_type} · by {r.builder_name || "volunteer"} ({r.source})
            </p>
            <p className="text-xs text-muted-foreground">
              {r.unhelpful_count} not helpful · {r.helpful_count} helpful
            </p>
            {pts[0] ? (
              <CommunityMapView center={{ lat: pts[0][0], lng: pts[0][1] }} roads={[{ id: r.id, points: pts, verified: false, pending: true }]} height={240} />
            ) : null}
            <ul className="space-y-2">
              {r.reports.map((f, i) => (
                <li key={i} className="rounded-xl bg-muted p-2 text-xs">
                  <b>{f.reason || "No reason"}</b> {f.note ? `— ${f.note}` : ""}
                  {f.photo ? <ReportPhoto path={f.photo} /> : null}
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => void decide(r.id, true)}>Maintain road</Button>
              <Button className="flex-1" variant="destructive" onClick={() => void decide(r.id, false)}>Close road</Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
