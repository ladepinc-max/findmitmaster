import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BadgeCheck, ClipboardList, GraduationCap } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  countPendingTeacherApplications,
  fetchMyTeacherApplication,
  useRole,
  type TeacherApplication,
} from "@/lib/roles";
import { Button } from "@/components/ui/button";

/** Profile > Settings > Applications — differs for public, teacher and admin. */
export function ApplicationsSection() {
  const { user } = useAuth();
  const { role, loading } = useRole();
  const [mine, setMine] = useState<TeacherApplication | null>(null);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (!user) return;
    if (role === "admin") {
      void countPendingTeacherApplications().then(setPending);
      return;
    }
    void fetchMyTeacherApplication(user.id).then(setMine);
  }, [user, role]);

  if (loading) return null;

  return (
    <section className="px-6 pb-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Applications</h2>

      {role === "admin" ? (
        <Link to="/admin/teacher-applications" className="mt-3 block">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
            <ClipboardList className="size-4 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-medium">Teacher Applications</p>
              <p className="text-xs text-muted-foreground">Review, approve or reject applicants</p>
            </div>
            {pending > 0 ? (
              <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
                {pending}
              </span>
            ) : null}
          </div>
        </Link>
      ) : role === "teacher" ? (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-success">
          <BadgeCheck className="size-4" />
          <p className="text-sm font-semibold">Teacher — Approved ✅</p>
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-border bg-surface px-4 py-3">
          <div className="flex items-center gap-3">
            <GraduationCap className="size-4 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-medium">Apply for Teacher</p>
              <p className="text-xs text-muted-foreground">
                {mine?.status === "pending"
                  ? "Your application is under review"
                  : mine?.status === "rejected"
                    ? "Your last application was rejected — you can apply again"
                    : "Teach live classes on FindMit"}
              </p>
            </div>
          </div>
          {mine?.status === "pending" ? null : (
            <Link to="/apply-teacher" className="mt-3 block">
              <Button className="w-full rounded-full">Apply for Teacher</Button>
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
