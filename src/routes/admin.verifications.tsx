import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { AppShell, ScreenHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import {
  fetchCompanyApplications,
  fetchTalentApplications,
  isAdmin,
  reviewCompanyApplication,
  reviewTalentApplication,
} from "@/lib/verification";

export const Route = createFileRoute("/admin/verifications")({
  component: AdminVerifications,
  head: () => ({
    meta: [
      { title: "Verification Reviews | FindMit Admin" },
      { name: "description", content: "FindMit team review queue for graduate and employer verification applications." },
      { property: "og:title", content: "Verification Reviews" },
      { property: "og:description", content: "Approve or reject FindMit Ghana verification applications." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type Row = Record<string, unknown> & { id: string; user_id: string; status: string; created_at: string };

function AdminVerifications() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [talent, setTalent] = useState<Row[]>([]);
  const [companies, setCompanies] = useState<Row[]>([]);

  const load = useCallback(async () => {
    const [t, c] = await Promise.all([fetchTalentApplications(), fetchCompanyApplications()]);
    setTalent(t as Row[]);
    setCompanies(c as Row[]);
  }, []);

  useEffect(() => {
    if (!user) {
      setAllowed(false);
      return;
    }
    void isAdmin(user.id).then((ok) => {
      setAllowed(ok);
      if (ok) void load();
    });
  }, [user, load]);

  const review = async (kind: "talent" | "company", row: Row, approve: boolean) => {
    try {
      if (kind === "talent") await reviewTalentApplication(row.id, row.user_id, approve);
      else await reviewCompanyApplication(row.id, row.user_id, approve);
      toast.success(approve ? "Approved" : "Rejected");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update");
    }
  };

  return (
    <AppShell>
      <ScreenHeader
        title="Verifications"
        action={
          <Button variant="ghost" size="sm" className="gap-2" onClick={() => void navigate({ to: "/jobs" })}>
            <ArrowLeft className="size-4" /> Back
          </Button>
        }
      />
      {allowed !== true ? (
        <AdminOnlyRedirect denied={allowed === false} />
      ) : (
        <div className="space-y-6 p-4">
          <section className="space-y-3">
            <h2 className="font-display text-base font-bold">Graduate applications</h2>
            {talent.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing to review.</p>
            ) : (
              talent.map((row) => (
                <div key={row.id} className="space-y-2 rounded-2xl border border-border p-4">
                  <p className="text-sm font-semibold">{String(row["projects"] ?? "").slice(0, 120) || "Application"}</p>
                  <p className="text-xs text-muted-foreground">Status: {row.status}</p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void review("talent", row, true)}>
                      Approve
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => void review("talent", row, false)}>
                      Reject
                    </Button>
                  </div>
                </div>
              ))
            )}
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-base font-bold">Employer applications</h2>
            {companies.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing to review.</p>
            ) : (
              companies.map((row) => (
                <div key={row.id} className="space-y-2 rounded-2xl border border-border p-4">
                  <p className="text-sm font-semibold">{String(row["company_name"] ?? "")}</p>
                  <p className="text-xs text-muted-foreground">
                    TIN {String(row["tin"] ?? "")} · Status: {row.status}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void review("company", row, true)}>
                      Approve
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => void review("company", row, false)}>
                      Reject
                    </Button>
                  </div>
                </div>
              ))
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}

function AdminOnlyRedirect({ denied }: { denied: boolean }) {
  const navigate = useNavigate();
  useEffect(() => {
    if (denied) void navigate({ to: "/", replace: true });
  }, [denied, navigate]);
  return null;
}
