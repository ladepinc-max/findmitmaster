import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/lib/auth";
import {
  fetchTeacherApplications,
  reviewTeacherApplication,
  signedUrl,
  type TeacherApplication,
} from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/teacher-applications")({
  head: () => ({
    meta: [
      { title: "Teacher Applications — FindMit Admin" },
      { name: "description", content: "Review and approve FindMit teacher applications." },
      { property: "og:title", content: "Teacher Applications — FindMit Admin" },
      { property: "og:description", content: "Approve or reject teacher applications on FindMit." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedRoute allow={["admin"]} message="Only the FindMit team can review teacher applications">
      <TeacherApplicationsPage />
    </ProtectedRoute>
  ),
});

function PrivateImage({ bucket, path, label }: { bucket: string; path: string; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    void signedUrl(bucket, path).then(setUrl);
  }, [bucket, path]);
  return (
    <figure className="space-y-1">
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt={label} className="h-24 w-full rounded-lg object-cover" />
        </a>
      ) : (
        <div className="grid h-24 place-items-center rounded-lg bg-secondary text-xs text-muted-foreground">…</div>
      )}
      <figcaption className="text-[0.6rem] font-semibold text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

function TeacherApplicationsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<TeacherApplication[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setRows(await fetchTeacherApplications());
    } catch {
      toast.error("Could not load applications");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const review = async (row: TeacherApplication, approve: boolean) => {
    if (!user) return;
    setBusy(row.id);
    try {
      await reviewTeacherApplication(row, approve, user.id);
      toast.success(approve ? `${row.name} is now a teacher` : "Application rejected");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the application");
    } finally {
      setBusy(null);
    }
  };

  const pending = rows.filter((row) => row.status === "pending").length;

  return (
    <main className="mx-auto min-h-screen max-w-lg bg-background pb-24">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-primary px-4 py-3 text-primary-foreground">
        <Link to="/settings" aria-label="Back" className="opacity-90 hover:opacity-100">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="font-display text-base font-bold">Teacher Applications</h1>
        {pending > 0 ? (
          <span className="ml-auto rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold">{pending} pending</span>
        ) : null}
      </header>

      <div className="space-y-4 px-4 py-5">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">No applications yet.</p>
        ) : (
          rows.map((row) => (
            <article key={row.id} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-display text-sm font-bold">
                    {row.name} · {row.age}
                  </h2>
                  <p className="text-xs text-muted-foreground">{row.current_school}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.personal_contact} · HOD {row.hod_contact}
                  </p>
                  <p className="text-[0.65rem] text-muted-foreground">
                    {new Date(row.created_at).toLocaleString()}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-1 text-[0.6rem] font-bold uppercase",
                    row.status === "approved"
                      ? "bg-success/15 text-success"
                      : row.status === "rejected"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-secondary text-muted-foreground",
                  )}
                >
                  {row.status}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <PrivateImage bucket="ghana-cards" path={row.ghana_card_front_url} label="Card front" />
                <PrivateImage bucket="ghana-cards" path={row.ghana_card_back_url} label="Card back" />
                <PrivateImage bucket="facial-verification" path={row.facial_verification_url} label={`Selfie · ${Math.round(row.match_score)}%`} />
              </div>

              {row.status === "pending" ? (
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 rounded-full" disabled={busy === row.id} onClick={() => void review(row, true)}>
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1 rounded-full"
                    disabled={busy === row.id}
                    onClick={() => void review(row, false)}
                  >
                    Reject
                  </Button>
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>
    </main>
  );
}
