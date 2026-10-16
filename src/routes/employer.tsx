import { useCachedState } from "@/lib/page-cache";
import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Briefcase,
  Copy,
  Crown,
  Eye,
  Loader2,
  Lock,
  MessageSquare,
  Phone,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, EmptyState, ScreenHeader } from "@/components/AppShell";
import { ContactPaywall } from "@/components/jobs/ContactPaywall";
import { UserAvatar } from "@/components/UserAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import {
  JOB_PLANS,
  fetchCredits,
  fetchMyUnlocks,
  fetchTalentContact,
  type UnlockRow,
  fetchJobApplicants,
  fetchMyJobPosts,
  fetchUnlockedTalentIds,
  type ApplicantRow,
  type EmployerJobRow,
} from "@/lib/hiring";
import { redeemJobPurchase } from "@/lib/hiring.functions";
import { daysUntilExpiry, fetchTalent, formatMoney, type TalentProfile } from "@/lib/jobs";
import { payWithPaystack } from "@/lib/paystack";
import { copyFindmitId, findmitId } from "@/lib/user-id";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/employer")({
  head: () => ({
    meta: [
      { title: "My Job Posts — FindMit" },
      {
        name: "description",
        content: "Track your FindMit job posts, see who applied and unlock candidate contact details.",
      },
      { property: "og:title", content: "My Job Posts — FindMit" },
      {
        property: "og:description",
        content: "Track your FindMit job posts, see who applied and unlock candidate contact details.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EmployerDashboard,
});

type Filter = "all" | "unlocked" | "locked";
type Tab = "jobs" | "talent" | "unlocks";
type JobStatus = "active" | "expired" | "pending";

function jobStatus(job: EmployerJobRow): JobStatus {
  if (!job.is_paid) return "pending";
  const days = daysUntilExpiry(job.expires_at);
  return days !== null && days <= 0 ? "expired" : "active";
}

function EmployerDashboard() {
  const { profile, session } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useCachedState<EmployerJobRow[] | null>("employer:jobs", null);
  const [openJob, setOpenJob] = useState<EmployerJobRow | null>(null);
  const [applicants, setApplicants] = useState<ApplicantRow[] | null>(null);
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set());
  const [talentByUser, setTalentByUser] = useState<Record<string, TalentProfile>>({});
  const [credits, setCredits] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [paywallTalent, setPaywallTalent] = useState<TalentProfile | null>(null);
  const [tab, setTab] = useState<Tab>("jobs");
  const [jobStatusFilter, setJobStatusFilter] = useState<JobStatus>("active");
  const [myTalent, setMyTalent] = useState<TalentProfile | null>(null);
  const [unlocks, setUnlocks] = useState<UnlockRow[] | null>(null);
  const [payingJob, setPayingJob] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    void (async () => {
      try {
        const [myJobs, unlocked, balance, talent] = await Promise.all([
          fetchMyJobPosts(profile.id),
          fetchUnlockedTalentIds(profile.id),
          fetchCredits(profile.id),
          fetchTalent(),
        ]);
        setJobs(myJobs);
        setUnlockedIds(unlocked);
        setCredits(balance.contacts_remaining);
        setTalentByUser(Object.fromEntries(talent.map((item) => [item.user_id, item])));
        setMyTalent(talent.find((item) => item.user_id === profile.id) ?? null);
        setUnlocks(await fetchMyUnlocks(profile.id));
      } catch (error) {
        console.error(error);
        toast.error("Could not load your dashboard");
      }
    })();
  }, [profile]);

  const openApplicants = async (job: EmployerJobRow) => {
    setOpenJob(job);
    setApplicants(null);
    try {
      setApplicants(await fetchJobApplicants(job.id));
    } catch (error) {
      console.error(error);
      toast.error("Could not load applicants");
    }
  };

  const payForJob = async (job: EmployerJobRow) => {
    if (!profile) return;
    const plan = JOB_PLANS.find((option) => option.id === (job.is_paid ? "renew" : "post"))!;
    setPayingJob(job.id);
    try {
      const reference = `fm_job_${plan.id}_${profile.id.slice(0, 8)}_${Date.now()}`;
      const paid = await payWithPaystack({
        amount: plan.price,
        email: session?.user.email ?? "",
        reference,
        metadata: { job_id: job.id, plan: plan.id },
      });
      if (!paid) return;
      const result = await redeemJobPurchase({ data: { jobId: job.id, plan: plan.id, reference } });
      setJobs((prev) =>
        (prev ?? []).map((row) =>
          row.id === job.id ? { ...row, is_paid: true, expires_at: result.expires_at } : row,
        ),
      );
      toast.success(`Listing active for ${plan.days} more days`);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Payment could not be completed");
    } finally {
      setPayingJob(null);
    }
  };

  const rows = (applicants ?? []).filter((row) => {
    const talent = talentByUser[row.employee_id];
    const isUnlocked = Boolean(talent && unlockedIds.has(talent.id));
    if (filter === "unlocked") return isUnlocked;
    if (filter === "locked") return !isUnlocked;
    return true;
  });

  return (
    <AppShell>
      <ScreenHeader
        title={openJob ? openJob.title : "My Job Posts"}
        action={
          openJob ? (
            <Button variant="ghost" size="sm" className="gap-2" onClick={() => setOpenJob(null)}>
              <ArrowLeft className="size-4" /> Back
            </Button>
          ) : (
            <Badge variant="secondary" className="rounded-full">
              {credits} credits
            </Badge>
          )
        }
      />

      {!openJob ? (
        <div>
          <div className="flex gap-1.5 px-4 pt-3">
            {(
              [
                ["jobs", "My Job Posts"],
                ["talent", "My Talent Profile"],
                ["unlocks", "My Unlocks"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={cn(
                  "flex-1 rounded-full px-3 py-2 text-xs font-semibold transition-colors",
                  tab === value ? "bg-foreground text-background" : "bg-secondary text-muted-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "jobs" ? (
            jobs === null ? (
              <Loading />
            ) : (
              <>
                <div className="flex gap-1.5 px-4 pt-3">
                  {(["active", "expired", "pending"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setJobStatusFilter(value)}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-[11px] font-semibold capitalize",
                        jobStatusFilter === value
                          ? "bg-primary/15 text-primary"
                          : "bg-secondary text-muted-foreground",
                      )}
                    >
                      {value === "pending" ? "Pending payment" : value}
                    </button>
                  ))}
                </div>
                {jobs.filter((job) => jobStatus(job) === jobStatusFilter).length === 0 ? (
                  <EmptyState
                    icon={Briefcase}
                    title={`No ${jobStatusFilter === "pending" ? "unpaid" : jobStatusFilter} posts`}
                    description="Post an opening and applicants will show up here."
                    action={<Button onClick={() => void navigate({ to: "/jobs" })}>Go to Jobs</Button>}
                  />
                ) : (
                  <ul className="space-y-4 p-4">
                    {jobs
                      .filter((job) => jobStatus(job) === jobStatusFilter)
                      .map((job) => {
                        const days = daysUntilExpiry(job.expires_at);
                        return (
                          <li key={job.id} className="card-premium p-5">
                            <button
                              type="button"
                              onClick={() => void openApplicants(job)}
                              className="w-full text-left"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <h3 className="truncate text-base font-semibold">{job.title}</h3>
                                  <p className="truncate text-sm text-muted-foreground">{job.company}</p>
                                </div>
                                {job.is_featured ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-gold px-2.5 py-1 text-[10px] font-bold uppercase text-gold-foreground">
                                    <Crown className="size-3" /> Featured
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                                <span className="flex items-center gap-1.5 font-medium text-primary">
                                  <Users className="size-4" /> {job.applicants_count}{" "}
                                  {job.applicants_count === 1 ? "applicant" : "applicants"}
                                </span>
                                {job.is_paid && days !== null ? (
                                  <Badge variant="secondary" className="rounded-full text-[11px]">
                                    {days > 0 ? `Expires in ${days} days` : "Expired"}
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="rounded-full text-[11px]">
                                    Pending payment
                                  </Badge>
                                )}
                              </div>
                            </button>
                            {jobStatus(job) !== "active" ? (
                              <Button
                                size="sm"
                                className="mt-3 w-full rounded-full"
                                disabled={payingJob === job.id}
                                onClick={() => void payForJob(job)}
                              >
                                {payingJob === job.id ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <>
                                    <RefreshCw className="mr-2 size-4" />
                                    {job.is_paid ? "Renew — GHS 15" : "Publish — GHS 25"}
                                  </>
                                )}
                              </Button>
                            ) : null}
                          </li>
                        );
                      })}
                  </ul>
                )}
              </>
            )
          ) : tab === "talent" ? (
            myTalent === null ? (
              <EmptyState
                icon={Users}
                title="No talent profile"
                description="Post your expertise so employers can hire you."
                action={<Button onClick={() => void navigate({ to: "/jobs" })}>Post My Expertise</Button>}
              />
            ) : (
              <div className="p-4">
                <div className="card-premium p-5">
                  <h3 className="text-base font-semibold">{myTalent.expertise}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatMoney(myTalent.rate_amount, myTalent.rate_currency, myTalent.rate_period)} ·{" "}
                    {myTalent.location_name}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="secondary" className="gap-1 rounded-full">
                      <Eye className="size-3" /> {myTalent.views_count} views
                    </Badge>
                    <Badge variant="secondary" className="rounded-full">
                      {myTalent.is_paid ? "Published" : "Not published — payment pending"}
                    </Badge>
                    {myTalent.face_verified ? (
                      <Badge className="rounded-full border-0 bg-success/15 text-success">Face verified</Badge>
                    ) : null}
                  </div>
                  <Button
                    variant="secondary"
                    className="mt-4 w-full rounded-full"
                    onClick={() => void navigate({ to: "/jobs" })}
                  >
                    Edit in Jobs
                  </Button>
                </div>
              </div>
            )
          ) : unlocks === null ? (
            <Loading />
          ) : unlocks.length === 0 ? (
            <EmptyState
              icon={Lock}
              title="No unlocked contacts"
              description="Contacts you pay to unlock appear here with call and WhatsApp buttons."
            />
          ) : (
            <ul className="space-y-3 p-4">
              {unlocks.map((row) => (
                <UnlockCard key={row.id} row={row} />
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="p-4">
          <div className="mb-4 flex gap-2">
            {(["all", "unlocked", "locked"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-xs font-semibold capitalize transition-colors",
                  filter === value ? "bg-foreground text-background" : "bg-secondary text-muted-foreground",
                )}
              >
                {value === "all" ? "All" : value === "unlocked" ? "Paid" : "Unpaid"}
              </button>
            ))}
          </div>

          {applicants === null ? (
            <Loading />
          ) : rows.length === 0 ? (
            <EmptyState icon={Users} title="No applicants" description="Nobody has applied to this job yet." />
          ) : (
            <ul className="space-y-3">
              {rows.map((row) => {
                const talent = talentByUser[row.employee_id];
                const isUnlocked = Boolean(talent && unlockedIds.has(talent.id));
                return (
                  <li key={row.id} className="card-premium flex items-center gap-3 p-4">
                    <UserAvatar profile={row.applicant} className="size-11" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {row.applicant?.display_name ?? "Applicant"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {row.applicant ? `@${row.applicant.username}` : ""} ·{" "}
                        {new Date(row.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    {talent ? (
                      <Button
                        size="sm"
                        variant={isUnlocked ? "secondary" : "default"}
                        className="rounded-full"
                        onClick={() => setPaywallTalent(talent)}
                      >
                        {isUnlocked ? <ShieldCheck className="mr-1.5 size-3.5" /> : <Lock className="mr-1.5 size-3.5" />}
                        {isUnlocked ? "Contact" : "Unlock"}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="rounded-full"
                        disabled={!row.conversation_id}
                        onClick={() =>
                          row.conversation_id &&
                          void navigate({ to: "/chat", search: { c: row.conversation_id } })
                        }
                      >
                        Chat
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {profile ? (
        <ContactPaywall
          talent={paywallTalent}
          open={paywallTalent !== null}
          onOpenChange={(open) => !open && setPaywallTalent(null)}
          userId={profile.id}
          email={session?.user.email ?? ""}
          unlocked={paywallTalent ? unlockedIds.has(paywallTalent.id) : false}
          onUnlocked={(id) => setUnlockedIds((prev) => new Set(prev).add(id))}
          onEmploy={() => setPaywallTalent(null)}
          employing={false}
          onPostJob={() => {
            setPaywallTalent(null);
            void navigate({ to: "/jobs", search: { tab: "jobs" } });
          }}
        />
      ) : null}
    </AppShell>
  );
}

function Loading() {
  return (
    <div className="flex justify-center py-20">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function UnlockCard({ row }: { row: UnlockRow }) {
  const [contact, setContact] = useState<{ phone: string; userId: string | null } | null>(null);

  useEffect(() => {
    let active = true;
    void fetchTalentContact(row.talent_profile_id)
      .then((value) => active && setContact(value ? { phone: value.phone, userId: value.user_id } : null))
      .catch((error) => console.error(error));
    return () => {
      active = false;
    };
  }, [row.talent_profile_id]);

  const talentCode = contact?.userId ? findmitId(contact.userId) : null;

  return (
    <li className="card-premium p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{row.talent?.expertise ?? "Talent"}</p>
          <p className="truncate text-xs text-muted-foreground">
            {row.talent?.location_name ?? ""} · {contact?.phone ?? "Loading…"}
          </p>
        </div>
        <Badge className="rounded-full border-0 bg-success/15 text-success">
          <ShieldCheck className="mr-1 size-3" /> Unlocked
        </Badge>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          size="sm"
          className="rounded-full"
          disabled={!talentCode}
          onClick={() => void copyFindmitId(talentCode ?? "")}
        >
          <Copy className="mr-1.5 size-3.5" /> {talentCode ?? "FindMit ID"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="rounded-full"
          disabled={!contact?.phone}
          onClick={() => (window.location.href = `tel:${contact?.phone}`)}
        >
          <Phone className="mr-1.5 size-3.5" /> Call
        </Button>
      </div>
    </li>
  );
}
