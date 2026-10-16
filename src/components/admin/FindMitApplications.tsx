import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  fetchCompanyApplications,
  fetchTalentApplications,
  setApplicationStatus,
  type ReviewStatus,
} from "@/lib/verification";

type Row = Record<string, unknown> & { id: string; user_id: string; status: string; created_at: string };

const STATUS_STYLE: Record<string, string> = {
  approved: "bg-success/15 text-success",
  rejected: "bg-destructive/15 text-destructive",
  pending: "bg-secondary text-muted-foreground",
};

function str(v: unknown) {
  return v == null ? "" : String(v);
}

/** Admin-only: FindMit Ghana graduate and employer applications with approve / reject / pending. */
export function FindMitApplications() {
  const [tab, setTab] = useState<"talent" | "company">("talent");
  const [talent, setTalent] = useState<Row[] | null>(null);
  const [companies, setCompanies] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [t, c] = await Promise.all([fetchTalentApplications(), fetchCompanyApplications()]);
      setTalent(t as Row[]);
      setCompanies(c as Row[]);
    } catch {
      setTalent([]);
      setCompanies([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (row: Row, status: ReviewStatus) => {
    setBusy(row.id + status);
    try {
      await setApplicationStatus(tab, row.id, row.user_id, status);
      toast.success(status === "approved" ? "Approved" : status === "rejected" ? "Rejected" : "Set to pending");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update");
    } finally {
      setBusy(null);
    }
  };

  const rows = tab === "talent" ? talent : companies;
  const pendingCount = (list: Row[] | null) => (list ?? []).filter((r) => r.status === "pending").length;

  return (
    <section className="mt-6 rounded-2xl border border-border bg-surface p-4">
      <h2 className="font-display text-base font-bold">Applications — FindMit Ghana</h2>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {(["talent", "company"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              "rounded-full px-3 py-2 text-xs font-semibold",
              tab === k ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
            )}
          >
            {k === "talent" ? "Graduates" : "Employers"} ({pendingCount(k === "talent" ? talent : companies)})
          </button>
        ))}
      </div>

      <div className="mt-3 max-h-[28rem] space-y-3 overflow-y-auto">
        {rows === null ? (
          <div className="h-20 animate-pulse rounded-xl bg-secondary" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No applications yet.</p>
        ) : (
          rows.map((row) => {
            const applicant = row["applicant"] as { display_name?: string; username?: string } | null;
            const title =
              tab === "talent"
                ? str(row["full_name"]) || applicant?.display_name || "Graduate"
                : str(row["company_name"]) || "Company";
            const details =
              tab === "talent"
                ? [str(row["skill_trade"]), str(row["phone"]), str(row["location_name"]), row["ghana_card"] ? `Ghana Card ${str(row["ghana_card"])}` : ""]
                : [
                    row["tin"] ? `TIN ${str(row["tin"])}` : "",
                    str(row["phone"]),
                    row["salary_min"] ? `Salary ¢${str(row["salary_min"])}–${str(row["salary_max"])}` : "",
                  ];
            return (
              <div key={row.id} className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold">{title}</p>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", STATUS_STYLE[row.status] ?? STATUS_STYLE["pending"])}>
                    {row.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {details.filter(Boolean).join(" · ")}
                  {" · "}
                  {new Date(row.created_at).toLocaleDateString()}
                </p>
                <Link
                  to="/admin/application/$kind/$id"
                  params={{ kind: tab, id: row.id }}
                  className="mt-2 block rounded-full border border-primary py-2 text-center text-xs font-bold text-primary"
                >
                  Review application
                </Link>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <Button size="sm" disabled={!!busy || row.status === "approved"} onClick={() => void act(row, "approved")}>
                    Approve
                  </Button>
                  <Button size="sm" variant="destructive" disabled={!!busy || row.status === "rejected"} onClick={() => void act(row, "rejected")}>
                    Reject
                  </Button>
                  <Button size="sm" variant="secondary" disabled={!!busy || row.status === "pending"} onClick={() => void act(row, "pending")}>
                    Pending
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
