import { openCheckout } from "@/lib/open-checkout";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Loader2, Save, Search, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { ExpertiseIcon } from "@/components/jobs/ExpertiseIcon";
import { FaceVerify } from "@/components/jobs/FaceVerify";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import {
  EXPERTISE_LIST,
  GHANA_REGIONS,
  GHANA_TOWNS,
  suggestedSkills,
} from "@/lib/expertise";
import { saveMyTalentContact } from "@/lib/hiring";
import { createTalentProfile } from "@/lib/jobs";
import { uploadCv } from "@/lib/media";
import { startPaystackCheckout } from "@/lib/checkout.functions";
import { MomoFields } from "@/components/jobs/MomoFields";
import { isValidMomoNumber, saveMomoDetails, type MomoDetails } from "@/lib/momo";

import {
  getPostingPrivileges,
  publishExpertisePost,
} from "@/lib/posting.functions";
import {
  formatClock,
  serialiseVideos,
  uploadFaceCapture,
  uploadTalentVideo,
  type TalentVideo,
} from "@/lib/talent-media";
import { cn } from "@/lib/utils";
import { copyFindmitId, findmitId } from "@/lib/user-id";
import { clearDraft, loadDraft, saveDraft, useDraftState } from "@/lib/form-draft";
import { useAppPrice } from "@/lib/pricing";

const TALENT_DRAFT_KEY = "expertise-post";

const PERIODS = [
  { value: "per_day", label: "Per Day" },
  { value: "per_week", label: "Per Week" },
  { value: "per_month", label: "Per Month" },
  { value: "per_project", label: "Per Project" },
];
const GENDERS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];
const AVAILABILITY = [
  { value: "available", label: "Available now" },
  { value: "open_to_offers", label: "Open to offers" },
  { value: "not_available", label: "Not available" },
];

export function PostTalentDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onDone: () => void;
}) {
  const { profile, session } = useAuth();
  const publishExpertise = useServerFn(publishExpertisePost);
  const startCheckout = useServerFn(startPaystackCheckout);
  const privileges = useServerFn(getPostingPrivileges);
  const [isAdmin, setIsAdmin] = useState(false);
  const { amount: TALENT_POST_FEE } = useAppPrice("talent_post");
  const [saving, setSaving] = useState(false);
  const [cv, setCv] = useState<File | null>(null);
  const [expertiseQuery, setExpertiseQuery] = useState("");
  const [years, setYears] = useState(0);
  const [skills, setSkills] = useState<string[]>([]);
  const [videos, setVideos] = useState<TalentVideo[]>([]);
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null);
  const [momo, setMomo] = useState<MomoDetails>({ number: "", provider: "mtn" });
  const [face, setFace] = useState<Blob | null>(null);

  const [form, setForm] = useState({
    expertise: "",
    gender: "male",
    age: "",
    region: GHANA_REGIONS[0] ?? "Greater Accra",
    town: "",
    landmark: "",
    description: "",
    rate_amount: "",
    rate_currency: "GHS",
    rate_period: "per_month",
    negotiable: false,
    availability: "available",
    phone: "",
    whatsapp: "",
  });

  const set = (key: keyof typeof form) => (value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const { hasDraft, refresh: refreshDraft } = useDraftState(TALENT_DRAFT_KEY, open);
  const myId = findmitId(profile?.id);

  // Bring back whatever was typed before the person left the page.
  useEffect(() => {
    if (!open) return;
    const draft = loadDraft<{ form: typeof form; years: number; skills: string[] }>(TALENT_DRAFT_KEY);
    if (!draft) return;
    setForm((prev) => ({ ...prev, ...draft.form }));
    setYears(draft.years ?? 0);
    setSkills(draft.skills ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const saveProgress = () => {
    saveDraft(TALENT_DRAFT_KEY, { form, years, skills });
    refreshDraft();
    toast.success("Saved — you can finish this later");
  };

  const discardProgress = () => {
    clearDraft(TALENT_DRAFT_KEY);
    refreshDraft();
    toast.success("Saved form cleared");
  };

  useEffect(() => {
    if (!open || !profile) return;
    void privileges()
      .then((result) => setIsAdmin(result.freeTalentPost))
      .catch(() => setIsAdmin(false));
  }, [open, profile, privileges]);

  const filteredExpertise = useMemo(() => {
    const value = expertiseQuery.trim().toLowerCase();
    if (!value) return EXPERTISE_LIST;
    return EXPERTISE_LIST.filter((item) => item.name.toLowerCase().includes(value));
  }, [expertiseQuery]);

  const towns = GHANA_TOWNS[form.region] ?? [];
  const suggestions = suggestedSkills(form.expertise);

  const pickExpertise = (name: string) => {
    setForm((prev) => ({ ...prev, expertise: name }));
    setSkills(suggestedSkills(name).slice(0, 5));
  };

  const toggleSkill = (skill: string) => {
    setSkills((prev) => {
      if (prev.includes(skill)) return prev.filter((value) => value !== skill);
      if (prev.length >= 5) {
        toast.error("Up to 5 skills");
        return prev;
      }
      return [...prev, skill];
    });
  };

  const addVideo = async (file: File | undefined, slot: number) => {
    if (!file || !profile) return;
    setUploadingSlot(slot);
    try {
      const video = await uploadTalentVideo(profile.id, file);
      setVideos((prev) => [...prev, video]);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Could not upload that video");
    } finally {
      setUploadingSlot(null);
    }
  };

  const submit = async (): Promise<void> => {
    if (!profile) return;
    const amount = Number(form.rate_amount);
    const age = Number(form.age);
    if (!form.expertise) { toast.error("Choose your expertise"); return; }
    if (!form.age || age < 16 || age > 65) { toast.error("Age must be between 16 and 65"); return; }
    if (!form.town.trim()) { toast.error("Choose your town"); return; }
    if (!form.description.trim()) { toast.error("Add a short bio"); return; }
    if (!form.rate_amount || Number.isNaN(amount) || amount <= 0) { toast.error("Salary amount and period are required"); return; }
    if (skills.length === 0) { toast.error("Pick at least one skill"); return; }
    if (!face) { toast.error("Complete the live facial verification"); return; }
    if (!form.phone.trim()) { toast.error("A phone number is required so employers can reach you"); return; }

    if (!isAdmin && !isValidMomoNumber(momo.number)) {
      toast.error("Enter the mobile money number you will pay with, e.g. 055XXXXXXX");
      return;
    }
    setSaving(true);

    try {
      const [cvPath, facePath] = await Promise.all([
        cv ? uploadCv(profile.id, cv) : Promise.resolve(null),
        uploadFaceCapture(profile.id, face),
      ]);
      const talentProfileId = await createTalentProfile({
        user_id: profile.id,
        expertise: form.expertise,
        years_experience: years,
        gender: form.gender,
        age,
        region: form.region,
        town: form.town.trim(),
        landmark: form.landmark.trim() || null,
        description: form.description.trim(),
        rate_amount: amount,
        rate_currency: "GHS",
        rate_period: form.rate_period,
        negotiable: form.negotiable,
        location_name: `${form.town.trim()}, ${form.region}`,
        availability: form.availability,
        skills,
        video_paths: serialiseVideos(videos),
        face_path: facePath,
        cv_path: cvPath,
      });
      await saveMyTalentContact({
        talentProfileId,
        userId: profile.id,
        phone: form.phone.trim(),
        whatsapp: null,
      });

      if (isAdmin) {
        await publishExpertise({ data: { talentProfileId } });
        toast.success("Your expertise is published");
      } else {
        await saveMomoDetails(profile.id, momo).catch(() => undefined);
        const { authorizationUrl } = await startCheckout({
          data: {
            kind: "expertise",
            targetId: talentProfileId,
            momoNumber: momo.number,
            callbackUrl: `${window.location.origin}/payment-verify`,
          },
        });
        toast.info(`Opening secure payment of GHS ${TALENT_POST_FEE}…`);
        openCheckout(authorizationUrl);
        return;
      }
      clearDraft(TALENT_DRAFT_KEY);
      refreshDraft();
      onDone();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Could not post your expertise");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle>Post My Expertise</DialogTitle>
          <DialogDescription>Free for workers. Employers pay to unlock your contact.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Expertise *">
            {form.expertise ? (
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, expertise: "" }))}
                className="flex w-full items-center gap-2 rounded-xl border border-primary/50 bg-primary/10 px-3 py-2.5 text-sm font-semibold"
              >
                <ExpertiseIcon name={form.expertise} className="size-4 text-primary" />
                {form.expertise}
                <X className="ml-auto size-4 text-muted-foreground" />
              </button>
            ) : (
              <div className="rounded-xl border border-border">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="border-0 pl-9"
                    value={expertiseQuery}
                    onChange={(event) => setExpertiseQuery(event.target.value)}
                    placeholder="Search 50 expertise types…"
                  />
                </div>
                <ul className="max-h-52 overflow-y-auto border-t border-border">
                  {filteredExpertise.map((item) => (
                    <li key={item.name}>
                      <button
                        type="button"
                        onClick={() => pickExpertise(item.name)}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-secondary"
                      >
                        <ExpertiseIcon name={item.name} className="size-4 text-primary" />
                        {item.name}
                      </button>
                    </li>
                  ))}
                  {filteredExpertise.length === 0 ? (
                    <li className="px-3 py-4 text-center text-sm text-muted-foreground">No match</li>
                  ) : null}
                </ul>
              </div>
            )}
          </Field>

          <Field label={`Years of experience — ${years === 0 ? "Beginner" : `${years} yrs`}`}>
            <Slider
              value={[years]}
              min={0}
              max={40}
              step={1}
              onValueChange={([value]) => setYears(value ?? 0)}
            />
          </Field>

          <Field label="Gender *">
            <div className="flex gap-2">
              {GENDERS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => set("gender")(option.value)}
                  className={cn(
                    "flex-1 rounded-full border px-3 py-2 text-sm font-medium transition-colors",
                    form.gender === option.value
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Age (16-65) *">
              <Input
                inputMode="numeric"
                value={form.age}
                onChange={(event) => set("age")(event.target.value)}
                placeholder="24"
              />
            </Field>
            <Field label="Availability">
              <Select value={form.availability} onValueChange={set("availability")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABILITY.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Region *">
              <Select
                value={form.region}
                onValueChange={(value) => setForm((prev) => ({ ...prev, region: value, town: "" }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GHANA_REGIONS.map((region) => (
                    <SelectItem key={region} value={region}>
                      {region}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Town *">
              <Input
                list="talent-towns"
                value={form.town}
                onChange={(event) => set("town")(event.target.value)}
                placeholder="Search town"
              />
              <datalist id="talent-towns">
                {towns.map((town) => (
                  <option key={town} value={town} />
                ))}
              </datalist>
            </Field>
          </div>

          <Field label="Landmark">
            <Input
              value={form.landmark}
              onChange={(event) => set("landmark")(event.target.value)}
              placeholder="Near Ashiaman Roundabout"
            />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Salary amount (GHS) *">
              <Input
                inputMode="decimal"
                value={form.rate_amount}
                onChange={(event) => set("rate_amount")(event.target.value)}
                placeholder="900"
              />
            </Field>
            <Field label="Period *">
              <Select value={form.rate_period} onValueChange={set("rate_period")}>
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

          <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5">
            <span className="text-sm font-medium">Negotiable</span>
            <Switch checked={form.negotiable} onCheckedChange={(value) => set("negotiable")(value)} />
          </div>

          <Field label={`Bio * (${form.description.length}/200)`}>
            <Textarea
              rows={3}
              maxLength={200}
              value={form.description}
              onChange={(event) => set("description")(event.target.value)}
              placeholder="What you do and the work you've delivered…"
            />
          </Field>

          {suggestions.length > 0 ? (
            <Field label={`Skills * (${skills.length}/5)`}>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((skill) => (
                  <button key={skill} type="button" onClick={() => toggleSkill(skill)}>
                    <Badge
                      variant={skills.includes(skill) ? "default" : "secondary"}
                      className="cursor-pointer rounded-full font-normal"
                    >
                      {skills.includes(skill) ? <Check className="mr-1 size-3" /> : null}
                      {skill}
                    </Badge>
                  </button>
                ))}
              </div>
            </Field>
          ) : null}

          <Field label="Proof videos (optional — up to 3, 3 min / 50MB each)">
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((slot) => {
                const video = videos[slot];
                return (
                  <label
                    key={slot}
                    className={cn(
                      "relative flex aspect-[3/4] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-surface text-[11px] text-muted-foreground",
                      video && "border-solid border-success/60 text-success",
                    )}
                  >
                    {uploadingSlot === slot ? (
                      <Loader2 className="size-5 animate-spin" />
                    ) : video ? (
                      <>
                        <Check className="size-5" />
                        {formatClock(video.d)}
                      </>
                    ) : (
                      <>
                        <Upload className="size-5" />
                        Video {slot + 1}
                      </>
                    )}
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      disabled={Boolean(video) || uploadingSlot !== null}
                      onChange={(event) => void addVideo(event.target.files?.[0], slot)}
                    />
                  </label>
                );
              })}
            </div>
          </Field>

          <FaceVerify done={face !== null} onCaptured={setFace} />

          <div className="grid grid-cols-2 gap-2">
            <Field label="Phone *">
              <Input
                inputMode="tel"
                value={form.phone}
                onChange={(event) => set("phone")(event.target.value)}
                placeholder="0244 000 000"
              />
            </Field>
            <Field label="Your FindMit ID">
              <button
                type="button"
                onClick={() => void copyFindmitId(myId)}
                className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-border bg-secondary px-3 text-sm font-semibold"
              >
                <span className="truncate">{myId || "—"}</span>
                <Copy className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </Field>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Employers reach you inside FindMit with your ID. Your number stays hidden — only employers who
            have posted a job can see it.
          </p>

          <MomoFields userId={profile?.id} value={momo} onChange={setMomo} enabled={!isAdmin} />


          <Field label="CV (optional)">
            <Input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={(event) => setCv(event.target.files?.[0] ?? null)}
            />
          </Field>

          <div className="rounded-2xl border border-primary/50 bg-primary/10 p-4">
            <p className="text-sm font-semibold">
              {isAdmin ? "Admin posting — free" : `Posting fee: GHS ${TALENT_POST_FEE}`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {isAdmin
                ? "Your profile publishes immediately at no cost."
                : `One-time GHS ${TALENT_POST_FEE} via MTN MoMo, Vodafone Cash, AirtelTigo or card. Your profile stays hidden until payment succeeds.`}
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
            <Save className="mr-2 size-4" /> Save & continue later
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
          ) : (
            <>
              <Sparkles className="mr-2 size-4" />
              {isAdmin ? "Publish — Free" : `Pay GHS ${TALENT_POST_FEE} & Publish`}
            </>
          )}
        </Button>
      </DialogContent>
    </Dialog>
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
