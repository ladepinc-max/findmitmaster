import { useEffect, useState } from "react";
import { AdminLongPressDelete } from "@/components/admin/AdminLongPressDelete";
import { useRole } from "@/lib/roles";
import { useNavigate } from "@tanstack/react-router";
import { BadgeCheck, Building2, HeartHandshake, Lock, MapPin, ShieldCheck, Sparkles, Users } from "lucide-react";
const heroAsset = { url: "/images/accra-office-ghana.jpg" };
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/lib/auth";
import { applyToJob, formatMoney, type Job } from "@/lib/jobs";
import { toast } from "sonner";
import {
  FINDMIT_MIN_MONTHLY_SALARY,
  fetchCompanyApproved,
  fetchMyVerification,
  fetchVerifiedGraduates,
  fetchVerifiedJobs,
  type VerifiedGraduate,
  type VerificationStatus,
} from "@/lib/verification";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

const BADGES = ["FindMit Certified", "Job-Ready", "Skills Verified", "Fair Pay Guaranteed"];

const EMPLOYER_BENEFITS = [
  "Well vetted, approved workers",
  "Worker replacement if an employee doesn't fit the field they were employed for",
  "FindMit receives updates on each employee's working character and sanctions misconduct. If police or legal action is needed, FindMit takes the burden of handling it with the company",
];

const EMPLOYEE_BENEFITS = [
  "Verified jobs",
  `Good salaries — at least GHS ${FINDMIT_MIN_MONTHLY_SALARY.toLocaleString()} per month`,
  "SSNIT payment",
  "Insurance payment",
];

const REQUIREMENTS = [
  `Minimum salary: GHS ${FINDMIT_MIN_MONTHLY_SALARY.toLocaleString()} per month`,
  "Must pay SSNIT for every worker",
  "Must provide insurance cover",
  "Company registration + Ghana Card verification",
];

function GoldCard({ children, className }: { children: React.ReactNode; className?: string | undefined }) {
  return (
    <div
      className={cn(
        "rounded-2xl border-2 border-ghana-gold bg-card p-4 shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

function DisabledAction({ label, tip }: { label: string; tip: string }) {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex w-full">
            <Button
              disabled
              variant="secondary"
              className="pointer-events-none h-11 w-full rounded-full font-semibold opacity-70"
            >
              <Lock className="mr-2 size-4" /> {label}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{tip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function FindMitGhanaSection({
  onPostJob,
  onPostTalent,
}: { onPostJob?: () => void; onPostTalent?: () => void } = {}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin } = useRole();
  const [graduates, setGraduates] = useState<VerifiedGraduate[] | null>(null);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [status, setStatus] = useState<VerificationStatus>("none");
  const [companyApproved, setCompanyApproved] = useState(false);
  const [companyPending, setCompanyPending] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const apply = async (job: Job) => {
    if (!user) return;
    if (status !== "verified") {
      toast.error("Only approved FindMit graduates can apply to these jobs");
      return;
    }
    setApplyingId(job.id);
    try {
      const conversationId = await applyToJob(job, user.id);
      toast.success("Application sent — opening chat");
      void navigate({ to: "/chat", search: { c: conversationId } });
    } catch (error) {
      console.error(error);
      toast.error("Could not send your application");
    } finally {
      setApplyingId(null);
    }
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [g, j] = await Promise.all([fetchVerifiedGraduates(), fetchVerifiedJobs()]);
        if (!active) return;
        setGraduates(g);
        setJobs(j);
      } catch {
        if (!active) return;
        setGraduates([]);
        setJobs([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onDeleted = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      setJobs((prev) => (prev ? prev.filter((j) => j.id !== id) : prev));
    };
    const onTalent = (e: Event) => {
      const uid = (e as CustomEvent<string>).detail;
      setGraduates((prev) => (prev ? prev.filter((g) => g.id !== uid) : prev));
    };
    window.addEventListener("findmit:job-deleted", onDeleted);
    window.addEventListener("findmit:talent-deleted", onTalent);
    return () => {
      window.removeEventListener("findmit:job-deleted", onDeleted);
      window.removeEventListener("findmit:talent-deleted", onTalent);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void Promise.all([
      fetchMyVerification(user.id).catch(() => "none" as VerificationStatus),
      supabase
        .from("talent_verification_applications")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "approved")
        .limit(1),
    ]).then(([value, { data }]) => {
      if (active) setStatus(data?.length ? "verified" : value);
    });
    void fetchCompanyApproved(user.id).then((value) => {
      if (active) setCompanyApproved(value);
    });
    void supabase
      .from("company_verification_applications")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .limit(1)
      .then(({ data }) => {
        if (active) setCompanyPending(Boolean(data?.length));
      });
    return () => {
      active = false;
    };
  }, [user]);

  return (
    <section id="findmit-ghana-verified" className="space-y-7 pb-10 pt-1">
      {/* Hero */}
      <div>
        <div className="relative z-10 mb-[-0.2rem] ml-4 inline-flex items-center gap-2 rounded-full border border-ghana-gold bg-ghana-gold px-5 py-2 text-sm font-bold text-ghana-gold-foreground shadow-sm">
          <ShieldCheck className="size-4" /> FindMit Ghana
        </div>
        <div className="relative overflow-hidden rounded-[2rem]">
          <img
            src={heroAsset.url}
            alt="Verified FindMit professionals working together in an Accra office"
            className="aspect-[4/3] w-full object-cover sm:aspect-[16/10]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
          <h2 className="absolute inset-x-0 bottom-0 px-4 pb-5 font-display text-3xl font-bold leading-tight text-foreground drop-shadow sm:px-6 sm:text-4xl">
            Verified Talent &amp; Verified Jobs
          </h2>
        </div>
      </div>

      <div className="space-y-5 px-4">
        <p className="text-lg leading-relaxed text-muted-foreground">
          Ghana&apos;s trusted hiring circle. Only verified graduates and companies that meet fair pay, SSNIT, and
          insurance standards.
        </p>
        <div className="flex flex-wrap gap-2">
          {BADGES.map((badge) => (
            <span
              key={badge}
              className="inline-flex items-center gap-2 rounded-full border border-ghana-gold bg-ghana-gold px-4 py-2 text-sm font-bold text-ghana-gold-foreground"
            >
              <BadgeCheck className="size-4 text-ghana-green" /> {badge}
            </span>
          ))}
        </div>
      </div>

      {/* Benefits */}
      <div className="grid gap-3 px-4 sm:grid-cols-2">
        <GoldCard>
          <p className="flex items-center gap-2 font-display text-base font-bold">
            <Building2 className="size-4 text-ghana-green" /> Employer benefits
          </p>
          <ol className="mt-2 space-y-1.5 text-sm text-muted-foreground">
            {EMPLOYER_BENEFITS.map((item, i) => (
              <li key={item} className="flex gap-2">
                <span className="font-semibold text-ghana-green">{i + 1}.</span> {item}
              </li>
            ))}
          </ol>
        </GoldCard>
        <GoldCard>
          <p className="flex items-center gap-2 font-display text-base font-bold">
            <Users className="size-4 text-ghana-green" /> Employee benefits
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
            {EMPLOYEE_BENEFITS.map((item) => (
              <li key={item} className="flex gap-2">
                <BadgeCheck className="mt-0.5 size-4 shrink-0 text-ghana-green" /> {item}
              </li>
            ))}
          </ul>
        </GoldCard>
      </div>

      {/* A: verified graduates */}
      <div className="space-y-3 px-4">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-[#FFD700]" />
          <h3 className="font-display text-base font-bold">Verified FindMit Graduates</h3>
        </div>

        {status === "verified" && onPostTalent ? (
          <Button className="h-11 w-full rounded-full font-semibold" onClick={onPostTalent}>
            Post My Expertise — free
          </Button>
        ) : (
          <DisabledAction
            label="Post My Expertise"
            tip="Only verified graduates can post here. Apply below."
          />
        )}

        {graduates === null ? (
          <div className="h-24 animate-pulse rounded-2xl bg-secondary" />
        ) : graduates.length === 0 ? (
          <GoldCard className="text-center text-sm text-muted-foreground">Only verified graduates appear here</GoldCard>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {graduates.map((grad) => (
              <AdminLongPressDelete
                key={grad.id}
                enabled={isAdmin}
                onDelete={async () => {
                  const { error } = await supabase.from("talent_profiles").delete().eq("user_id", grad.id);
                  if (error) throw error;
                  setGraduates((prev) => (prev ? prev.filter((g) => g.id !== grad.id) : prev));
                  window.dispatchEvent(new CustomEvent("findmit:talent-deleted", { detail: grad.id }));
                }}
              >
              <GoldCard>
                <div className="flex items-start gap-3">
                  <UserAvatar photoPath={grad.photo_path} name={grad.display_name} className="size-11" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{grad.display_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {grad.expertise ?? `@${grad.username}`}
                      {grad.location_name ? ` · ${grad.location_name}` : ""}
                    </p>
                  </div>
                </div>
                <p className="mt-3 inline-flex items-center gap-1 rounded-full bg-[#16a34a]/15 px-2.5 py-1 text-[11px] font-semibold text-[#16a34a]">
                  <BadgeCheck className="size-3.5" /> FindMit Ghana Certified
                </p>
                <div className="mt-3 flex items-center justify-between border-t border-[#FFD700]/40 pt-3 text-xs text-muted-foreground">
                  <span>{grad.completed_projects} completed projects</span>
                  <span className="font-semibold text-foreground">Skill score {grad.skill_score}</span>
                </div>
              </GoldCard>
              </AdminLongPressDelete>
            ))}
          </div>
        )}

        {status === "verified" ? (
          <GoldCard className="text-center">
            <p className="flex items-center justify-center gap-2 font-display text-lg font-extrabold text-ghana-green">
              <BadgeCheck className="size-5" /> APPROVED GRADUATE
            </p>
          </GoldCard>
        ) : (
          <GoldCard className="space-y-3 text-center">
            <p className="text-sm font-semibold">
              {status === "pending" ? "Your verification is under review" : "Want to be in FindMit Ghana?"}
            </p>
            <Button
              className="h-11 w-full rounded-full bg-[#16a34a] font-semibold text-white hover:bg-[#15803d]"
              onClick={() => void navigate({ to: "/apply-findmit-verification" })}
            >
              Apply to Convert
            </Button>
          </GoldCard>
        )}
      </div>

      {/* B: verified companies */}
      <div className="space-y-3 px-4">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-[#FFD700]" />
          <h3 className="font-display text-base font-bold">Verified Companies &amp; Jobs</h3>
        </div>

        {companyApproved && onPostJob ? (
          <Button className="h-11 w-full rounded-full font-semibold" onClick={onPostJob}>
            Post Job — free
          </Button>
        ) : (
          <DisabledAction
            label="Post Job"
            tip="Only verified companies can post in FindMit Ghana. Apply to be verified."
          />
        )}

        <div className="rounded-2xl border border-[#16a34a]/40 bg-[#16a34a]/10 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <HeartHandshake className="size-4 text-[#16a34a]" /> Requirements to be listed here
          </p>
          <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
            {REQUIREMENTS.map((item, index) => (
              <li key={item} className="flex gap-2">
                <span className="font-semibold text-[#16a34a]">{index + 1}.</span> {item}
              </li>
            ))}
          </ul>
        </div>

        {jobs === null ? (
          <div className="h-24 animate-pulse rounded-2xl bg-secondary" />
        ) : jobs.length === 0 ? (
          <GoldCard className="text-center text-sm text-muted-foreground">
            No verified jobs yet. Only companies that meet the standards appear here.
          </GoldCard>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {jobs.map((job) => (
              <AdminLongPressDelete
                key={job.id}
                enabled={isAdmin}
                onDelete={async () => {
                  const { data, error } = await supabase.from("jobs").delete().eq("id", job.id).select("id");
                  if (error) throw error;
                  if (!data?.length) throw new Error("Post could not be deleted");
                  window.dispatchEvent(new CustomEvent("findmit:job-deleted", { detail: job.id }));
                }}
              >
              <GoldCard>
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#16a34a]/15">
                    <Building2 className="size-5 text-[#16a34a]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{job.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {job.company} · {job.location_name}
                    </p>
                  </div>
                </div>
                <p className="mt-3 inline-flex items-center gap-1 rounded-full bg-[#16a34a]/15 px-2.5 py-1 text-[11px] font-semibold text-[#16a34a]">
                  <ShieldCheck className="size-3.5" /> Verified employer · SSNIT &amp; insurance
                </p>
                <div className="mt-3 flex items-center justify-between border-t border-[#FFD700]/40 pt-3 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {formatMoney(job.salary_amount, job.salary_currency, job.salary_period)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="size-3.5" /> {job.applicants_count}
                  </span>
                </div>
                {job.employer_id === user?.id ? null : status === "verified" ? (
                  <Button
                    className="mt-3 h-10 w-full rounded-full font-semibold"
                    disabled={applyingId === job.id}
                    onClick={() => void apply(job)}
                  >
                    Apply
                  </Button>
                ) : (
                  <div className="mt-3">
                    <DisabledAction label="Apply" tip="Only approved FindMit graduates can apply to these jobs." />
                    <p className="mt-1 text-center text-[11px] text-muted-foreground">
                      Only approved FindMit graduates can apply
                    </p>
                  </div>
                )}
              </GoldCard>
              </AdminLongPressDelete>
            ))}
          </div>
        )}

        {companyApproved ? (
          <GoldCard className="text-center">
            <p className="flex items-center justify-center gap-2 font-display text-lg font-extrabold text-ghana-green">
              <BadgeCheck className="size-5" /> APPROVED EMPLOYER
            </p>
          </GoldCard>
        ) : (
        <GoldCard className="space-y-3 text-center">
          {companyPending ? (
            <p className="rounded-full bg-ghana-gold px-3 py-1.5 text-sm font-bold text-ghana-gold-foreground">
              Reviewing — your employer application is awaiting admin approval
            </p>
          ) : null}
          <p className="text-sm font-semibold">Hiring fairly? Join the trusted circle.</p>
          <Button
            className="h-11 w-full rounded-full bg-[#14532d] font-semibold text-white hover:bg-[#052e16]"
            onClick={() => void navigate({ to: "/apply-company-verification" })}
          >
            Apply to be a Verified Employer
          </Button>
          <p className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
            <MapPin className="size-3" /> Ghana only · reviewed by the FindMit team
          </p>
        </GoldCard>
        )}
      </div>
    </section>
  );
}
