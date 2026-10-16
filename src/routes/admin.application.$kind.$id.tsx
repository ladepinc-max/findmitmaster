import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, FileText, Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { setApplicationStatus, type ReviewStatus } from "@/lib/verification";

export const Route = createFileRoute("/admin/application/$kind/$id")({
  head: () => ({
    meta: [
      { title: "Review application — FindMit admin" },
      { name: "description", content: "Review a FindMit Ghana application and its uploaded documents." },
      { property: "og:title", content: "Review application — FindMit admin" },
      { property: "og:description", content: "Review a FindMit Ghana application and its uploaded documents." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ProtectedRoute allow={["admin"]}>
      <ReviewPage />
    </ProtectedRoute>
  ),
});

type Row = Record<string, unknown>;
type Media = { label: string; bucket: string; path: string; kind: "video" | "image" | "doc" };

const TALENT_FIELDS: [string, string][] = [
  ["full_name", "Full name"], ["phone", "Phone"], ["location_name", "Location"], ["ghana_card", "Ghana Card"],
  ["skill_trade", "Skill / trade"], ["learning_pathway", "Learning pathway"], ["master_trainer", "Master trainer"],
  ["years_experience", "Years of experience"], ["evidence_option", "Evidence option"], ["short_bio", "Short bio"],
  ["reason", "Reason for applying"], ["findmit_user_id", "FindMit User ID"], ["fee_reference", "Payment reference"],
];
const COMPANY_FIELDS: [string, string][] = [
  ["company_name", "Company name"], ["tin", "TIN"], ["industry", "Industry"], ["region_city", "Region / city"],
  ["company_size", "Company size"], ["website", "Website"], ["official_email", "Official email"],
  ["ghana_card_number", "Ghana Card"], ["phone", "Phone"], ["hr_contact_name", "HR contact name"],
  ["hr_contact_position", "HR contact position"], ["salary_min", "Minimum salary (¢)"], ["salary_max", "Maximum salary (¢)"],
  ["staff_count", "Number of staff"], ["information_confirmed", "Confirmed information is accurate"],
];

function kindOf(path: string): Media["kind"] {
  const p = path.toLowerCase();
  if (/\.(mp4|mov|webm|m4v|3gp)$/.test(p)) return "video";
  if (/\.(jpe?g|png|webp|gif|heic)$/.test(p)) return "image";
  return "doc";
}

function collectMedia(kind: string, row: Row): Media[] {
  const list: Media[] = [];
  const add = (label: string, bucket: string, v: unknown) => {
    if (typeof v === "string" && v) list.push({ label, bucket, path: v, kind: kindOf(v) });
  };
  if (kind === "talent") {
    add("Working video", "talent-videos", row["video1_path"]);
    add("Finished work video", "talent-videos", row["video2_path"]);
    add("CV", "cvs", row["cv_path"]);
    add("Certificate", "cvs", row["certificate_path"]);
    ((row["photo_paths"] as string[] | null) ?? []).forEach((p, i) => add(`Photo ${i + 1}`, "cvs", p));
  } else {
    add("SSNIT clearance", "cvs", row["ssnit_proof_path"]);
    add("Workers' compensation", "cvs", row["workers_compensation_path"]);
    add("Registration / Ghana Card", "cvs", row["registration_ghana_card_path"]);
    add("Insurance policy", "cvs", row["insurance_policy_path"]);
    ((row["documents_paths"] as string[] | null) ?? []).forEach((p, i) => add(`Document ${i + 1}`, "cvs", p));
  }
  return list;
}

function ReviewPage() {
  const { kind, id } = Route.useParams();
  const navigate = useNavigate();
  const table = kind === "company" ? "company_verification_applications" : "talent_verification_applications";
  const [row, setRow] = useState<Row | null | undefined>(undefined);
  const [open, setOpen] = useState<{ media: Media; url: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
    setRow((data as Row | null) ?? null);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, id]);

  const view = async (media: Media) => {
    const { data, error } = await supabase.storage.from(media.bucket).createSignedUrl(media.path, 600);
    if (error || !data?.signedUrl) {
      toast.error("Could not open this file");
      return;
    }
    if (media.kind === "doc") window.open(data.signedUrl, "_blank", "noopener");
    else setOpen({ media, url: data.signedUrl });
  };

  const act = async (status: ReviewStatus) => {
    if (!row) return;
    setBusy(status);
    try {
      await setApplicationStatus(kind === "company" ? "company" : "talent", id, String(row["user_id"]), status);
      toast.success(`Marked ${status}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update");
    } finally {
      setBusy(null);
    }
  };

  if (row === undefined) return <div className="grid min-h-screen place-items-center"><Loader2 className="size-6 animate-spin" /></div>;
  if (row === null) return <p className="p-6 text-center text-sm text-muted-foreground">Application not found.</p>;

  const fields = kind === "company" ? COMPANY_FIELDS : TALENT_FIELDS;
  const media = collectMedia(kind, row);
  const status = String(row["status"]);

  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 p-4 pb-28">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Back" onClick={() => void navigate({ to: "/profile" })}>
          <ArrowLeft />
        </Button>
        <h1 className="font-display text-lg font-bold">{kind === "company" ? "Employer application" : "Graduate application"}</h1>
        <span className="ml-auto rounded-full bg-secondary px-3 py-1 text-xs font-bold uppercase">{status}</span>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <dl className="space-y-3">
          {fields.map(([key, label]) => {
            const v = row[key];
            const text = typeof v === "boolean" ? (v ? "Yes" : "No") : v == null || v === "" ? "—" : String(v);
            return (
              <div key={key}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="whitespace-pre-line text-sm font-medium">{text}</dd>
              </div>
            );
          })}
          <div>
            <dt className="text-xs text-muted-foreground">Submitted</dt>
            <dd className="text-sm font-medium">{new Date(String(row["created_at"])).toLocaleString()}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="mb-3 font-display text-base font-bold">Uploaded media</h2>
        {media.length === 0 ? (
          <p className="text-sm text-muted-foreground">No files uploaded.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {media.map((m) => (
              <button
                key={m.path}
                type="button"
                onClick={() => void view(m)}
                className="flex items-center gap-2 rounded-xl border border-border bg-background p-3 text-left text-sm font-semibold"
              >
                {m.kind === "video" ? <Play className="size-5 text-primary" /> : <FileText className="size-5 text-primary" />}
                <span className="truncate">{m.label}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-3 gap-2">
        <Button disabled={!!busy || status === "approved"} onClick={() => void act("approved")}>Approve</Button>
        <Button variant="destructive" disabled={!!busy || status === "rejected"} onClick={() => void act("rejected")}>Reject</Button>
        <Button variant="secondary" disabled={!!busy || status === "pending"} onClick={() => void act("pending")}>Pending</Button>
      </div>

      <Dialog open={open !== null} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-3xl p-2">
          <DialogTitle className="px-2 text-sm">{open?.media.label}</DialogTitle>
          {open?.media.kind === "video" ? (
            <video src={open.url} controls autoPlay playsInline className="max-h-[75vh] w-full rounded-lg" />
          ) : open ? (
            <img src={open.url} alt={open.media.label} className="max-h-[75vh] w-full rounded-lg object-contain" />
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
  );
}
