import { openCheckout } from "@/lib/open-checkout";
import { useCachedState } from "@/lib/page-cache";
import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Briefcase,
  Crosshair,
  LayoutDashboard,
  Loader2,
  Search,
  SlidersHorizontal,
  Sparkles,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, EmptyState } from "@/components/AppShell";
import { AdminLongPressDelete } from "@/components/admin/AdminLongPressDelete";
import { supabase } from "@/integrations/supabase/client";
import { ContactPaywall } from "@/components/jobs/ContactPaywall";
import { JobCard } from "@/components/jobs/JobCard";
import { FindMitGhanaSection } from "@/components/jobs/FindMitGhanaSection";
import { FINDMIT_MIN_MONTHLY_SALARY, NORMAL_MIN_MONTHLY_SALARY, fetchCompanyApproved } from "@/lib/verification";
import { ShopLocationCapture, type ShopCapture } from "@/components/jobs/ShopLocationCapture";
import { uploadCommunityPhoto } from "@/lib/community-map";
import { PostTalentDialog } from "@/components/jobs/PostTalentDialog";
import { TalentCard } from "@/components/jobs/TalentCard";
import { TalentVideoSheet } from "@/components/jobs/TalentVideoSheet";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import {
  fetchSavedJobIds,
  fetchUnlockedTalentIds,
  toggleSavedJob,
} from "@/lib/hiring";
import {
  applyToJob,
  createJob,
  employTalent,
  fetchJobs,
  fetchTalent,
  type Job,
  type TalentProfile,
} from "@/lib/jobs";
import { sendJobMatchPushes, sendPushToUser } from "@/lib/push.functions";
import { getPostingPrivileges, publishJobPost } from "@/lib/posting.functions";
import { startPaystackCheckout } from "@/lib/checkout.functions";
import { MomoFields } from "@/components/jobs/MomoFields";
import { isValidMomoNumber, saveMomoDetails, type MomoDetails } from "@/lib/momo";

import { EXPERTISE_LIST, SLIDESHOW_BGS, getBg } from "@/lib/expertise";
import { cn } from "@/lib/utils";
import { useRole } from "@/lib/roles";
import { useAppPrice } from "@/lib/pricing";
import { useFreeAccess } from "@/lib/free-access";
import { payWithPaystack } from "@/lib/paystack";
import { clearDraft, loadDraft, saveDraft, useDraftState } from "@/lib/form-draft";

const JOB_DRAFT_KEY = "job-post";

export const Route = createFileRoute("/jobs")({
  validateSearch: (search: Record<string, unknown>): { tab?: "jobs" | "talent" | "ghana" } => {
    const tab = search["tab"];
    return tab === "jobs" || tab === "talent" || tab === "ghana" ? { tab } : {};
  },
  head: () => ({
    meta: [
      { title: "Jobs & Talent — FindMit" },
      {
        name: "description",
        content: "Post openings, apply to jobs or offer your expertise and chat instantly on FindMit.",
      },
      { property: "og:title", content: "Jobs & Talent — FindMit" },
      {
        property: "og:description",
        content: "Post openings, apply to jobs or offer your expertise and chat instantly on FindMit.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: JobsPage,
});

const JOB_TYPES = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "remote", label: "Remote" },
  { value: "on_site", label: "On-site" },
];
const PERIODS = [
  { value: "per_week", label: "Per Week" },
  { value: "per_month", label: "Per Month" },
];
const GENDERS = [
  { value: "any", label: "Any" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

function JobsPage() {
  const { amount: applyFee } = useAppPrice("job_apply");
  const { amount: employFee } = useAppPrice("talent_employ");
  const freeAccess = useFreeAccess();
  const { isAdmin: isRoleAdmin } = useRole();
  const { profile, session } = useAuth();
  const navigate = useNavigate();
  const pushToUser = useServerFn(sendPushToUser);
  const search = Route.useSearch();
  const [tab, setTab] = useState<"jobs" | "talent" | "ghana">(search.tab ?? "jobs");
  const [term, setTerm] = useState("");
  const [typeFilters, setTypeFilters] = useState<string[]>([]);
  const [savedOnly, setSavedOnly] = useState(false);
  const [jobs, setJobs] = useCachedState<Job[] | null>("jobs:list", null);
  const [talent, setTalent] = useCachedState<TalentProfile[] | null>("jobs:talent", null);
  useEffect(() => {
    const onDeleted = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      setJobs((prev) => (prev ? prev.filter((j) => j.id !== id) : prev));
    };
    const onTalent = (e: Event) => {
      const uid = (e as CustomEvent<string>).detail;
      setTalent((prev) => (prev ? prev.filter((t) => t.user_id !== uid) : prev));
    };
    window.addEventListener("findmit:job-deleted", onDeleted);
    window.addEventListener("findmit:talent-deleted", onTalent);
    return () => {
      window.removeEventListener("findmit:job-deleted", onDeleted);
      window.removeEventListener("findmit:talent-deleted", onTalent);
    };
  }, [setJobs, setTalent]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set());
  const [jobFormOpen, setJobFormOpen] = useState(false);
  const [talentFormOpen, setTalentFormOpen] = useState(false);
  const [paywallTalent, setPaywallTalent] = useState<TalentProfile | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expertiseFilter, setExpertiseFilter] = useState<string | null>(null);
  const [slide, setSlide] = useState(0);
  const [videoTalent, setVideoTalent] = useState<{ talent: TalentProfile; index: number } | null>(null);
  // Admins and employers who already paid for a job post can see phone numbers.
  const postingPrivileges = useServerFn(getPostingPrivileges);
  const [contactAccess, setContactAccess] = useState(false);

  useEffect(() => {
    if (!profile) {
      setContactAccess(false);
      return;
    }
    void postingPrivileges()
      .then((result) => setContactAccess(result.isAdmin || result.hasPaidJob))
      .catch(() => setContactAccess(false));
  }, [profile, postingPrivileges]);

  // Deep links like /jobs?tab=ghana (e.g. from the FindMit logo) switch the tab.
  useEffect(() => {
    if (search.tab) setTab(search.tab);
  }, [search.tab]);

  const load = async () => {
    try {
      const [nextJobs, nextTalent] = await Promise.all([
        fetchJobs(term),
        fetchTalent(term, expertiseFilter),
      ]);
      setJobs(nextJobs);
      setTalent(nextTalent);
    } catch (error) {
      console.error(error);
      toast.error("Could not load listings");
    }
  };

  useEffect(() => {
    const id = window.setTimeout(() => void load(), term ? 300 : 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, expertiseFilter]);

  // Cycle every workshop background every 4 seconds (Find Jobs + Find Talent).
  useEffect(() => {
    const id = window.setInterval(() => setSlide((value) => (value + 1) % SLIDESHOW_BGS.length), 4000);
    return () => window.clearInterval(id);
  }, []);
  // Preload so each slide appears instantly.
  useEffect(() => {
    SLIDESHOW_BGS.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, []);

  const talentBg = expertiseFilter ? getBg(expertiseFilter) : SLIDESHOW_BGS[slide]!;

  useEffect(() => {
    if (!profile) return;
    void (async () => {
      try {
        const [saved, unlocked] = await Promise.all([
          fetchSavedJobIds(profile.id),
          fetchUnlockedTalentIds(profile.id),
        ]);
        setSavedIds(saved);
        setUnlockedIds(unlocked);
      } catch (error) {
        console.error(error);
      }
    })();
  }, [profile]);

  const handleApply = async (job: Job) => {
    if (!profile) return;
    if (job.employer_id === profile.id) {
      toast.error("This is your own listing");
      return;
    }
    if (!isRoleAdmin && !freeAccess.jobs_contact && applyFee > 0) {
      const paid = await payWithPaystack(session?.user.email ?? "", applyFee);
      if (!paid) {
        toast.error("Payment is required to apply");
        return;
      }
    }
    setBusyId(job.id);
    try {
      const conversationId = await applyToJob(job, profile.id);
      toast.success("Application sent — opening chat");
      void pushToUser({
        data: {
          userId: job.employer_id,
          title: `New application from ${profile.display_name ?? "Someone"}`,
          body: `Applied for: ${job.title}`,
          url: `/chat?c=${conversationId}`,
          tag: `chat-${conversationId}`,
        },
      });
      void navigate({ to: "/chat", search: { c: conversationId } });
    } catch (error) {
      console.error(error);
      toast.error("Could not send your application");
    } finally {
      setBusyId(null);
    }
  };

  const handleSave = async (job: Job) => {
    if (!profile) return;
    const isSaved = savedIds.has(job.id);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (isSaved) next.delete(job.id);
      else next.add(job.id);
      return next;
    });
    try {
      await toggleSavedJob(profile.id, job.id, isSaved);
    } catch (error) {
      console.error(error);
      toast.error("Could not update saved jobs");
    }
  };

  const handleEmploy = async (item: TalentProfile) => {
    if (!profile) return;
    if (item.user_id === profile.id) {
      toast.error("This is your own listing");
      return;
    }
    if (!isRoleAdmin && !freeAccess.jobs_contact && employFee > 0) {
      const paid = await payWithPaystack(session?.user.email ?? "", employFee);
      if (!paid) {
        toast.error("Payment is required to employ");
        return;
      }
    }
    setBusyId(item.id);
    try {
      const conversationId = await employTalent(item, profile.id);
      toast.success("Offer sent — opening chat");
      setPaywallTalent(null);
      void pushToUser({
        data: {
          userId: item.user_id,
          title: `New offer from ${profile.display_name ?? "Someone"}`,
          body: `Wants to employ you for: ${item.expertise || "a role"}`,
          url: `/chat?c=${conversationId}`,
          tag: `chat-${conversationId}`,
        },
      });
      void navigate({ to: "/chat", search: { c: conversationId } });
    } catch (error) {
      console.error(error);
      toast.error("Could not send your offer");
    } finally {
      setBusyId(null);
    }
  };

  const visibleJobs = (jobs ?? []).filter(
    (job) =>
      (typeFilters.length === 0 || typeFilters.includes(job.job_type)) &&
      (!savedOnly || savedIds.has(job.id)),
  );

  return (
    <AppShell>
      <div className="jobs-header flex items-center justify-between border-b border-border px-4 pb-5 pt-6">
        <h1 className="font-display text-4xl font-bold">Jobs</h1>
        <Button variant="ghost" className="h-11 gap-2 px-2 text-base" onClick={() => void navigate({ to: "/employer" })}>
          <LayoutDashboard className="size-5" /> My posts
        </Button>
      </div>

      <div className="sticky top-0 z-20 space-y-3 bg-background/95 px-4 py-4 backdrop-blur">
        <div className="flex rounded-full bg-secondary p-1.5">
          {(["jobs", "talent", "ghana"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={cn(
                "flex-1 rounded-full px-1 py-3 text-sm font-bold transition-all duration-300 sm:text-base",
                tab === value
                  ? "bg-tab-active text-tab-active-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {value === "jobs" ? "Find Jobs" : value === "talent" ? "Find Talent" : "FindMit Ghana"}
            </button>
          ))}
        </div>

        {tab === "ghana" ? null : (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 rounded-full border-transparent bg-secondary pl-11 text-sm placeholder:text-muted-foreground"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder={tab === "jobs" ? "Search jobs, company or location" : "Search expertise or location"}
            />
          </div>
          {tab === "jobs" ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  className="size-11 shrink-0 rounded-full"
                  aria-label="Filter jobs"
                >
                  <SlidersHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Job type</DropdownMenuLabel>
                {JOB_TYPES.map((option) => (
                  <DropdownMenuCheckboxItem
                    key={option.value}
                    checked={typeFilters.includes(option.value)}
                    onCheckedChange={(checked) =>
                      setTypeFilters((prev) =>
                        checked ? [...prev, option.value] : prev.filter((value) => value !== option.value),
                      )
                    }
                  >
                    {option.label}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem checked={savedOnly} onCheckedChange={(v) => setSavedOnly(Boolean(v))}>
                  Saved jobs only
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
        )}

        {tab === "ghana" ? null : (
        <Button
          className="h-11 w-full rounded-full font-semibold"
          onClick={() => (tab === "jobs" ? setJobFormOpen(true) : setTalentFormOpen(true))}
        >
          {tab === "jobs" ? "Post a Job" : "Post My Expertise"}
        </Button>
        )}

        {tab === "talent" ? (
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
            <FilterChip active={expertiseFilter === null} onClick={() => setExpertiseFilter(null)}>
              All
            </FilterChip>
            {EXPERTISE_LIST.map((item) => (
              <FilterChip
                key={item.name}
                active={expertiseFilter === item.name}
                onClick={() => setExpertiseFilter(item.name)}
              >
                {item.name}
              </FilterChip>
            ))}
          </div>
        ) : null}
      </div>

      {tab === "ghana" ? (
        <FindMitGhanaSection
          onPostJob={() => setJobFormOpen(true)}
          onPostTalent={() => setTalentFormOpen(true)}
        />
      ) : tab === "jobs" ? (
        jobs === null ? (
          <Loading />
        ) : visibleJobs.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title="No jobs yet"
            description="Openings posted by employers will show up here."
            action={<Button onClick={() => setJobFormOpen(true)}>Post a Job</Button>}
          />
        ) : (
          <div className="talent-feed-wrapper min-h-[60vh]" style={{ backgroundImage: `url(${SLIDESHOW_BGS[slide]})` }}>
          <ul className="talent-cards-layer space-y-4 p-4">
            {visibleJobs.map((job) => (
              <AdminLongPressDelete
                key={job.id}
                enabled={isRoleAdmin}
                onDelete={async () => {
                  const { data, error } = await supabase.from("jobs").delete().eq("id", job.id).select("id");
                  if (error) throw error;
                  if (!data?.length) throw new Error("Post could not be deleted");
                  setJobs((prev) => (prev ?? []).filter((j) => j.id !== job.id));
                  window.dispatchEvent(new CustomEvent("findmit:job-deleted", { detail: job.id }));
                }}
              >
                <JobCard
                  job={job}
                  busy={busyId === job.id}
                  isMine={job.employer_id === profile?.id}
                  saved={savedIds.has(job.id)}
                  onApply={() => void handleApply(job)}
                  onToggleSave={() => void handleSave(job)}
                />
              </AdminLongPressDelete>
            ))}
          </ul>
          </div>
        )
      ) : (
        <div className="talent-feed-wrapper min-h-[60vh]" style={{ backgroundImage: `url(${talentBg})` }}>
          <div className="talent-cards-layer">
            {talent === null ? (
              <Loading />
            ) : talent.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No talent yet"
                description="People offering their expertise will show up here."
                action={<Button onClick={() => setTalentFormOpen(true)}>Post My Expertise</Button>}
              />
            ) : (
              <ul className="space-y-4 p-4">
                {talent.map((item) => (
                  <AdminLongPressDelete
                    key={item.id}
                    enabled={isRoleAdmin}
                    onDelete={async () => {
                      const { data, error } = await supabase.from("talent_profiles").delete().eq("id", item.id).select("id");
                      if (error) throw error;
                      if (!data?.length) throw new Error("Post could not be deleted");
                      setTalent((prev) => (prev ?? []).filter((t) => t.id !== item.id));
                      window.dispatchEvent(new CustomEvent("findmit:talent-deleted", { detail: item.user_id }));
                    }}
                  >
                    <TalentCard
                      item={item}
                      busy={busyId === item.id}
                      isMine={item.user_id === profile?.id}
                      unlocked={contactAccess || item.user_id === profile?.id || unlockedIds.has(item.id)}
                      onEmploy={() => setPaywallTalent(item)}
                      onWatch={(index) => setVideoTalent({ talent: item, index })}
                    />
                  </AdminLongPressDelete>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <TalentVideoSheet
        talent={videoTalent?.talent ?? null}
        startIndex={videoTalent?.index ?? 0}
        open={videoTalent !== null}
        onOpenChange={(next) => !next && setVideoTalent(null)}
        unlocked={
          videoTalent
            ? contactAccess ||
              videoTalent.talent.user_id === profile?.id ||
              unlockedIds.has(videoTalent.talent.id)
            : false
        }
        onUnlock={() => {
          const item = videoTalent?.talent ?? null;
          setVideoTalent(null);
          setPaywallTalent(item);
        }}
      />

      {profile ? (
        <ContactPaywall
          talent={paywallTalent}
          open={paywallTalent !== null}
          onOpenChange={(open) => !open && setPaywallTalent(null)}
          userId={profile.id}
          email={session?.user.email ?? ""}
          unlocked={
            paywallTalent
              ? contactAccess || paywallTalent.user_id === profile.id || unlockedIds.has(paywallTalent.id)
              : false
          }
          onUnlocked={(id) => setUnlockedIds((prev) => new Set(prev).add(id))}
          onEmploy={(item) => void handleEmploy(item)}
          employing={busyId === paywallTalent?.id}
          onPostJob={() => {
            setPaywallTalent(null);
            setTab("jobs");
            setJobFormOpen(true);
          }}
        />
      ) : null}

      <PostJobDialog
        open={jobFormOpen}
        onOpenChange={setJobFormOpen}
        onDone={() => {
          setJobFormOpen(false);
          void load();
        }}
      />
      <PostTalentDialog
        open={talentFormOpen}
        onOpenChange={setTalentFormOpen}
        onDone={() => {
          setTalentFormOpen(false);
          void load();
        }}
      />
    </AppShell>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
        active ? "bg-foreground text-background" : "bg-secondary text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Loading() {
  return (
    <div className="flex justify-center py-20">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function PostJobDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onDone: () => void;
}) {
  const { amount: JOB_POST_FEE } = useAppPrice("job_post");
  const { profile, session } = useAuth();
  const pushJobMatches = useServerFn(sendJobMatchPushes);
  const publishJob = useServerFn(publishJobPost);
  const startCheckout = useServerFn(startPaystackCheckout);
  const privileges = useServerFn(getPostingPrivileges);
  const [isAdmin, setIsAdmin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    company: "",
    salary_amount: "",
    salary_currency: "GHS",
    salary_period: "per_month",
    job_type: "full_time",
    category: "",
    vacancies: "1",
    gender_requirement: "any",
    age_min: "",
    age_max: "",
    location_name: "",
    description: "",
    skills: "",
  });
  const [coords, setCoords] = useState<ShopCapture | null>(null);
  const [shopPhoto, setShopPhoto] = useState<Blob | null>(null);
  const [momo, setMomo] = useState<MomoDetails>({ number: "", provider: "mtn" });


  const set = (key: keyof typeof form) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const { hasDraft, refresh: refreshDraft } = useDraftState(JOB_DRAFT_KEY, open);

  // Restore an unfinished job post so nobody has to start over.
  useEffect(() => {
    if (!open) return;
    const draft = loadDraft<typeof form>(JOB_DRAFT_KEY);
    if (draft) setForm((prev) => ({ ...prev, ...draft }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const saveProgress = () => {
    saveDraft(JOB_DRAFT_KEY, form);
    refreshDraft();
    toast.success("Saved — you can finish this later");
  };

  const discardProgress = () => {
    clearDraft(JOB_DRAFT_KEY);
    refreshDraft();
    toast.success("Saved form cleared");
  };

  useEffect(() => {
    if (!open || !profile) return;
    void privileges()
      .then((result) => setIsAdmin(result.isAdmin))
      .catch(() => setIsAdmin(false));
  }, [open, profile, privileges]);

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Location is not available on this device");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy });
        toast.success("Workplace pin set to your current location");
      },
      () => toast.error("Could not read your location"),
    );
  };

  const submit = async () => {
    if (!profile) return;
    const amount = Number(form.salary_amount);
    if (!form.title.trim() || !form.company.trim() || !form.category.trim() || !form.location_name.trim()) {
      toast.error("Title, company, category and location are required");
      return;
    }
    if (!form.salary_amount || Number.isNaN(amount) || amount <= 0) {
      toast.error("Salary amount is required");
      return;
    }
    const verifiedCompany = await fetchCompanyApproved(profile.id).catch(() => false);
    const minSalary = verifiedCompany ? FINDMIT_MIN_MONTHLY_SALARY : NORMAL_MIN_MONTHLY_SALARY;
    if (form.salary_period === "per_month" && amount < minSalary) {
      toast.error(
        verifiedCompany
          ? `FindMit Ghana verified companies must pay at least ¢${minSalary.toLocaleString()} per month`
          : `Minimum salary is ¢${minSalary.toLocaleString()} per month`,
      );
      return;
    }
    if (!form.description.trim()) {
      toast.error("Add a job description");
      return;
    }
    if (!isAdmin && !isValidMomoNumber(momo.number)) {
      toast.error("Enter the mobile money number you will pay with, e.g. 055XXXXXXX");
      return;
    }
    if (!coords || !shopPhoto) {
      toast.error("Capture the shop location and take a picture of the shop");
      return;
    }
    setSaving(true);

    try {
      const shopPath = await uploadCommunityPhoto(profile.id, shopPhoto, "jpg");
      const jobId = await createJob({
        employer_id: profile.id,
        title: form.title.trim(),
        company: form.company.trim(),
        salary_amount: amount,
        salary_currency: form.salary_currency.trim().toUpperCase() || "GHS",
        salary_period: form.salary_period,
        job_type: form.job_type,
        category: form.category.trim(),
        vacancies: Math.max(1, Number(form.vacancies) || 1),
        gender_requirement: form.gender_requirement,
        age_min: form.age_min ? Number(form.age_min) : null,
        age_max: form.age_max ? Number(form.age_max) : null,
        location_name: form.location_name.trim(),
        location_lat: coords?.lat ?? null,
        location_lng: coords?.lng ?? null,
        shop_photo_path: shopPath,
        description: form.description.trim(),
        skills: form.skills
          .split(",")
          .map((skill) => skill.trim())
          .filter(Boolean),
      });
      if (isAdmin) {
        await publishJob({ data: { jobId } });
        toast.success("Job published");
      } else {
        await saveMomoDetails(profile.id, momo).catch(() => undefined);
        const { authorizationUrl } = await startCheckout({
          data: {
            kind: "job",
            targetId: jobId,
            momoNumber: momo.number,
            callbackUrl: `${window.location.origin}/payment-verify`,
          },
        });
        toast.info(`Opening secure payment of GHS ${JOB_POST_FEE}…`);
        openCheckout(authorizationUrl);
        return;
      }
      // Alert everyone whose saved job alert matches this new posting.
      void pushJobMatches({ data: { jobId } }).catch(() => undefined);
      clearDraft(JOB_DRAFT_KEY);
      refreshDraft();
      onDone();
    } catch (error) {
      console.error(error);
      toast.error("Could not post this job");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle>Post a Job</DialogTitle>
          <DialogDescription>Applicants message you directly the moment they apply.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Job title *">
            <Input value={form.title} onChange={(e) => set("title")(e.target.value)} placeholder="Barista" />
          </Field>
          <Field label="Company *">
            <Input value={form.company} onChange={(e) => set("company")(e.target.value)} placeholder="Company name" />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Currency">
              <Input value={form.salary_currency} onChange={(e) => set("salary_currency")(e.target.value)} />
            </Field>
            <Field label="Amount *">
              <Input
                inputMode="decimal"
                value={form.salary_amount}
                onChange={(e) => set("salary_amount")(e.target.value)}
                placeholder="1200"
              />
            </Field>
            <Field label="Period *">
              <Select value={form.salary_period} onValueChange={set("salary_period")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIODS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Type">
              <Select value={form.job_type} onValueChange={set("job_type")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {JOB_TYPES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Category / area *">
              <Input value={form.category} onChange={(e) => set("category")(e.target.value)} placeholder="Hospitality" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Vacancies">
              <Input inputMode="numeric" value={form.vacancies} onChange={(e) => set("vacancies")(e.target.value)} />
            </Field>
            <Field label="Gender requirement">
              <Select value={form.gender_requirement} onValueChange={set("gender_requirement")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GENDERS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Minimum age">
              <Input inputMode="numeric" value={form.age_min} onChange={(e) => set("age_min")(e.target.value)} />
            </Field>
            <Field label="Maximum age">
              <Input inputMode="numeric" value={form.age_max} onChange={(e) => set("age_max")(e.target.value)} />
            </Field>
          </div>
          <Field label="Shop / workplace name *">
            <Input
              value={form.location_name}
              onChange={(e) => set("location_name")(e.target.value)}
              placeholder="e.g. Ama's Salon, Madina Zongo Junction"
            />
          </Field>
          <ShopLocationCapture coords={coords} onCoords={setCoords} photo={shopPhoto} onPhoto={setShopPhoto} />
          <Field label="Description *">
            <Textarea
              rows={4}
              value={form.description}
              onChange={(e) => set("description")(e.target.value)}
              placeholder="What the role involves…"
            />
          </Field>
          <Field label="Skills (comma separated)">
            <Input value={form.skills} onChange={(e) => set("skills")(e.target.value)} placeholder="Customer service, POS" />
          </Field>

          <MomoFields userId={profile?.id} value={momo} onChange={setMomo} enabled={!isAdmin} />


          <div className="rounded-2xl border border-primary/50 bg-primary/10 p-4">
            <p className="text-sm font-semibold">
              {isAdmin ? "Admin posting — free" : `Posting fee: GHS ${JOB_POST_FEE}`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {isAdmin
                ? "Your job publishes immediately at no cost."
                : `One-time GHS ${JOB_POST_FEE} via MTN MoMo, Vodafone Cash, AirtelTigo or card. Your job stays hidden until payment succeeds, then runs for 30 days.`}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            className="h-11 flex-1 rounded-full font-semibold"
            onClick={saveProgress}
          >
            Save & continue later
          </Button>
          {hasDraft ? (
            <Button type="button" variant="ghost" className="h-11 rounded-full" onClick={discardProgress}>
              Clear
            </Button>
          ) : null}
        </div>

        <Button className="h-11 w-full rounded-full font-semibold" disabled={saving} onClick={() => void submit()}>
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : isAdmin ? (
            "Publish Job — Free"
          ) : (
            `Pay GHS ${JOB_POST_FEE} & Publish`
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

