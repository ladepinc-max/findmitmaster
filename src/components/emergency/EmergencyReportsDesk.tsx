import { useCallback, useEffect, useState } from "react";
import { MapPin, Navigation, Phone, Siren } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { EVIDENCE_BUCKET, NEXT_STATUS, type EmergencyReport } from "@/lib/emergency-reports";

const STATUS_LABEL: Record<string, string> = { new: "New", acknowledged: "Acknowledged", dispatched: "Dispatched", resolved: "Resolved" };

function ReportCard({ r, onAdvance }: { r: EmergencyReport; onAdvance: (r: EmergencyReport) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!r.media_path) return;
    void supabase.storage.from(EVIDENCE_BUCKET).createSignedUrl(r.media_path, 3600).then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [r.media_path]);
  const next = NEXT_STATUS[r.status];
  const hasLoc = r.lat != null && r.lng != null;
  return (
    <article className={`space-y-3 rounded-2xl border-2 bg-card p-3 ${r.status === "new" ? "border-destructive" : "border-border"}`}>
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-bold text-destructive">{r.incident_type}</span>
        <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">{STATUS_LABEL[r.status]}</span>
      </div>
      {hasLoc ? (
        <a href={`https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl bg-destructive px-3 py-3 text-destructive-foreground">
          <MapPin className="size-7 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-black leading-tight">{r.lat!.toFixed(5)}, {r.lng!.toFixed(5)}</span>
            <span className="block text-xs font-semibold">±{Math.round(r.accuracy_m ?? 0)} m · tap for directions</span>
          </span>
          <Navigation className="size-6 shrink-0" />
        </a>
      ) : <p className="rounded-xl bg-muted p-3 text-sm font-bold">Reporter's location was not available</p>}
      {r.media_path ? (
        url ? (r.media_kind === "video" ? <video src={url} controls playsInline className="w-full rounded-xl bg-muted" /> : <img src={url} alt="Evidence" className="w-full rounded-xl" />)
          : <div className="aspect-video animate-pulse rounded-xl bg-muted" />
      ) : null}
      {r.description ? <p className="whitespace-pre-wrap break-words text-sm">{r.description}</p> : null}
      <div className="flex gap-2">
        {r.reporter_phone ? <Button asChild variant="outline" className="flex-1"><a href={`tel:${r.reporter_phone.replace(/\s/g, "")}`}><Phone className="size-4" />Call reporter</a></Button> : null}
        {next ? <Button className="flex-1" onClick={() => onAdvance(r)}>Mark {STATUS_LABEL[next]}</Button> : null}
      </div>
    </article>
  );
}

/** Private incident desk: only the station owner can read these rows. */
export function EmergencyReportsDesk({ shopId }: { shopId: string }) {
  const [reports, setReports] = useState<EmergencyReport[]>([]);
  const load = useCallback(async () => {
    const { data } = await supabase.from("emergency_reports").select("*").eq("shop_id", shopId).order("created_at", { ascending: false }).limit(50);
    setReports((data ?? []) as EmergencyReport[]);
  }, [shopId]);
  useEffect(() => {
    void load();
    const ch = supabase.channel(`emergency:${shopId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "emergency_reports", filter: `shop_id=eq.${shopId}` }, (p) => {
        if (p.eventType === "INSERT") toast.error("New emergency report received");
        void load();
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [shopId, load]);

  const advance = async (r: EmergencyReport) => {
    const next = NEXT_STATUS[r.status];
    if (!next) return;
    const { error } = await supabase.from("emergency_reports").update({ status: next }).eq("id", r.id);
    if (error) toast.error("Could not update the report"); else void load();
  };

  const open = reports.filter((r) => r.status !== "resolved").length;
  return (
    <section className="space-y-3 rounded-2xl bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Siren className="size-5 text-destructive" />
        <p className="font-display font-bold">Incident reports</p>
        <span className="ml-auto rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-bold text-destructive">{open} open</span>
      </div>
      <p className="text-xs text-muted-foreground">Private to your station — the public cannot see these.</p>
      {reports.length === 0 ? <p className="text-sm text-muted-foreground">No reports yet.</p> : reports.map((r) => <ReportCard key={r.id} r={r} onAdvance={(x) => void advance(x)} />)}
    </section>
  );
}
