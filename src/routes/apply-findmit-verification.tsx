import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  FileText,
  GraduationCap,
  IdCard,
  Image as ImageIcon,
  Loader2,
  Lock,
  MapPin,
  MessageSquareOff,
  Phone,
  ShieldCheck,
  User,
  Users,
  Video,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, ScreenHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { useAppPrice } from "@/lib/pricing";
import { payWithPaystack } from "@/lib/paystack";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  submitTalentVerification,
  uploadVerificationDoc,
  uploadVerificationVideo,
} from "@/lib/verification";

export const Route = createFileRoute("/apply-findmit-verification")({
  component: ApplyFindMitVerification,
  head: () => ({
    meta: [
      { title: "Convert to a Verified FindMit Graduate | FindMit" },
      {
        name: "description",
        content:
          "Apply to become a Verified FindMit Graduate — for university graduates, artisans, apprentices and self-taught talents in Ghana.",
      },
      { property: "og:title", content: "Convert to a Verified FindMit Graduate" },
      {
        property: "og:description",
        content: "Submit your skill, evidence and Ghana Card details to join FindMit Ghana's verified circle.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const PATHWAYS = ["University", "Technical School", "Apprenticeship / Roadside Master", "Self-Taught", "Other"];
const MAX_DOC_MB = 5;
const MAX_VIDEO_MB = 50;

function Field({
  icon,
  label,
  required,
  hint,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-stretch gap-0 overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex w-11 shrink-0 items-center justify-center border-r border-gray-200 text-gray-600">
        {icon}
      </div>
      <div className="min-w-0 flex-1 px-3 py-2">
        <Label className="text-[13px] font-bold text-black">
          {label}
          {required ? <span className="text-[#dc2626]">*</span> : null}
          {hint ? <span className="ml-1 text-[11px] font-normal text-gray-600">{hint}</span> : null}
        </Label>
        {children}
      </div>
    </div>
  );
}

const inputClass =
  "mt-0.5 h-8 border-0 bg-transparent p-0 text-sm text-black shadow-none focus-visible:ring-0 placeholder:text-gray-500";

function ApplyFindMitVerification() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { amount: applicationFee } = useAppPrice("graduate_application");

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [ghanaCard, setGhanaCard] = useState("");
  const [skill, setSkill] = useState("");
  const [pathway, setPathway] = useState("");
  const [trainer, setTrainer] = useState("");
  const [years, setYears] = useState("");

  const [option, setOption] = useState<"video" | "document">("video");
  const [video1, setVideo1] = useState<File | null>(null);
  const [video2, setVideo2] = useState<File | null>(null);
  const [cv, setCv] = useState<File | null>(null);
  const [certificate, setCertificate] = useState<File | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);

  const [shortBio, setShortBio] = useState("");
  const [reason, setReason] = useState("");
  const [findmitId, setFindmitId] = useState("");
  const [saving, setSaving] = useState(false);

  const defaultId = useMemo(() => (user ? `FM-${user.id.slice(0, 8).toUpperCase()}` : ""), [user]);

  useEffect(() => {
    if (!user) return;
    setFindmitId((prev) => prev || defaultId);
    void supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.display_name) setFullName((prev) => prev || data.display_name);
      });
  }, [user, defaultId]);

  const tooBig = (file: File | null, mb: number) => Boolean(file && file.size > mb * 1024 * 1024);

  const submit = async () => {
    if (!user) {
      toast.error("Sign in first");
      return;
    }
    if (!fullName.trim() || !phone.trim() || !location.trim() || !ghanaCard.trim() || !skill.trim() || !pathway || !years.trim()) {
      toast.error("Fill in all required details");
      return;
    }
    if (!findmitId.trim()) {
      toast.error("Enter your FindMit User ID");
      return;
    }
    if (option === "video" && (!video1 || !video2)) {
      toast.error("Upload both videos, or switch to Option B — Document Proof");
      return;
    }
    if (option === "document" && (!cv || !certificate)) {
      toast.error("Upload your CV and certificate");
      return;
    }
    if (tooBig(video1, MAX_VIDEO_MB) || tooBig(video2, MAX_VIDEO_MB)) {
      toast.error(`Each video must be under ${MAX_VIDEO_MB}MB`);
      return;
    }
    if (tooBig(cv, MAX_DOC_MB) || tooBig(certificate, MAX_DOC_MB)) {
      toast.error(`Documents must be under ${MAX_DOC_MB}MB`);
      return;
    }

    if (applicationFee > 0) {
      const paid = await payWithPaystack(user.email ?? "", applicationFee);
      if (!paid) {
        toast.error("Payment is required to submit for review");
        return;
      }
    }

    setSaving(true);
    try {
      const [cvPath, certPath, v1, v2] = await Promise.all([
        cv ? uploadVerificationDoc(user.id, cv, "verification-cv") : Promise.resolve(null),
        certificate ? uploadVerificationDoc(user.id, certificate, "verification-certificate") : Promise.resolve(null),
        video1 ? uploadVerificationVideo(user.id, video1, "verification-working") : Promise.resolve(null),
        video2 ? uploadVerificationVideo(user.id, video2, "verification-finished") : Promise.resolve(null),
      ]);
      const photoPaths = await Promise.all(
        photos.slice(0, 4).map((photo, index) => uploadVerificationDoc(user.id, photo, `verification-photo-${index + 1}`)),
      );

      await submitTalentVerification({
        userId: user.id,
        cvPath,
        projects: skill.trim(),
        reason: reason.trim(),
        feeReference: null,
        fullName: fullName.trim(),
        phone: phone.trim(),
        locationName: location.trim(),
        ghanaCard: ghanaCard.trim(),
        skillTrade: skill.trim(),
        learningPathway: pathway,
        masterTrainer: trainer.trim() || null,
        yearsExperience: years.trim(),
        evidenceOption: option,
        video1Path: v1,
        video2Path: v2,
        certificatePath: certPath,
        photoPaths,
        shortBio: shortBio.trim(),
        findmitUserId: findmitId.trim(),
      });
      toast.success("Payment received — your application is under review");
      void navigate({ to: "/jobs", search: { tab: "ghana" } as never });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <ScreenHeader
        title="Convert to Verified"
        action={
          <Button variant="ghost" size="sm" className="gap-2" onClick={() => void navigate({ to: "/jobs" })}>
            <ArrowLeft className="size-4" /> Back
          </Button>
        }
      />

      <div className="bg-white p-3 text-black sm:p-5">
        <div className="mx-auto max-w-4xl rounded-3xl border border-gray-200 bg-white p-4 text-black shadow-lg sm:p-7">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-full bg-[#16a34a] text-white">
                <BadgeCheck className="size-5" />
              </span>
              <span className="font-display text-2xl font-extrabold text-[#16a34a]">FindMit</span>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700">
              <Lock className="size-3.5" /> Secure • Verified
            </span>
          </div>

          <h1 className="mt-5 text-center font-display text-2xl font-extrabold leading-tight text-black sm:text-3xl">
            Convert to a Verified FindMit Graduate
          </h1>
          <p className="mt-1 text-center text-sm text-gray-700">
            For university graduates, artisans, apprentices, and self-taught talents.
          </p>

          {/* Personal & professional */}
          <h2 className="mt-6 text-base font-bold text-black">Personal &amp; Professional Details</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Field icon={<User className="size-5" />} label="Full Name" required>
              <Input className={inputClass} value={fullName} maxLength={120} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Ama Serwaa Boateng" />
            </Field>
            <Field icon={<Phone className="size-5" />} label="Phone Number" required>
              <Input className={inputClass} value={phone} maxLength={20} onChange={(e) => setPhone(e.target.value)} placeholder="+233 24 000 0000" />
            </Field>
            <Field icon={<MapPin className="size-5" />} label="Location" required>
              <Input className={inputClass} value={location} maxLength={80} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Accra, Kumasi, Tamale" />
            </Field>
            <Field icon={<IdCard className="size-5" />} label="Ghana Card Number" required>
              <Input className={inputClass} value={ghanaCard} maxLength={20} onChange={(e) => setGhanaCard(e.target.value)} placeholder="GHA-1234567-8" />
            </Field>
            <Field icon={<Wrench className="size-5" />} label="Skill or Trade" required>
              <Input className={inputClass} value={skill} maxLength={120} onChange={(e) => setSkill(e.target.value)} placeholder="e.g. Carpentry, Tailoring, Software Development, Electrician" />
            </Field>
            <Field icon={<GraduationCap className="size-5" />} label="Where did you learn this skill" required>
              <select
                value={pathway}
                onChange={(e) => setPathway(e.target.value)}
                className="mt-0.5 h-8 w-full bg-transparent text-sm text-black outline-none"
              >
                <option value="">Select learning pathway</option>
                {PATHWAYS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </Field>
            <Field icon={<Users className="size-5" />} label="Name of Master Trainer" hint="optional">
              <Input className={inputClass} value={trainer} maxLength={120} onChange={(e) => setTrainer(e.target.value)} placeholder="e.g. Master Kofi Mensah (optional)" />
            </Field>
            <Field icon={<CalendarClock className="size-5" />} label="Years of Experience" required>
              <Input className={inputClass} value={years} maxLength={30} onChange={(e) => setYears(e.target.value)} placeholder="e.g. 3 years" />
            </Field>
          </div>

          {/* Supporting evidence */}
          <div className="mt-7 flex items-center justify-center gap-2 text-black">
            <ShieldCheck className="size-5" />
            <h2 className="font-display text-xl font-extrabold">Supporting Evidence</h2>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-gray-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setOption("video")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition",
                option === "video" ? "bg-[#16a34a]/15 text-[#16a34a] ring-2 ring-[#16a34a]" : "text-gray-700 hover:bg-gray-100",
              )}
            >
              <CheckCircle2 className="size-4" /> Option A — Video Proof
            </button>
            <button
              type="button"
              onClick={() => setOption("document")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition",
                option === "document" ? "bg-[#16a34a]/15 text-[#16a34a] ring-2 ring-[#16a34a]" : "text-gray-700 hover:bg-gray-100",
              )}
            >
              <FileText className="size-4" /> Option B — Document Proof
            </button>
          </div>

          {option === "video" ? (
            <div className="mt-3 rounded-xl border-l-4 border-[#16a34a] bg-[#16a34a]/10 p-4">
              <p className="font-bold text-[#16a34a]">
                Option A — Video Proof <span className="text-xs font-semibold">(Selected)</span>
              </p>
              <p className="mt-1 text-sm text-gray-800">
                • Upload 2 videos — each max 2 minutes, showing you working and your finished work
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {[
                  { label: "Video 1: You working", file: video1, set: setVideo1 },
                  { label: "Video 2: Finished work", file: video2, set: setVideo2 },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-[#16a34a]/40 bg-white p-3">
                    <p className="flex items-center gap-2 text-sm font-bold text-black">
                      <Video className="size-4 text-[#16a34a]" /> {item.label}
                    </p>
                    <p className="text-[11px] text-gray-600">MP4/MOV • Max 2 min • Max {MAX_VIDEO_MB}MB</p>
                    <Input
                      type="file"
                      accept="video/mp4,video/quicktime"
                      className="mt-2 h-9 text-xs text-black"
                      onChange={(e) => item.set(e.target.files?.[0] ?? null)}
                    />
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setOption("document")}
                className="mt-3 text-xs italic text-gray-700 underline"
              >
                Or upload documents to skip videos: switch to Option B
              </button>
            </div>
          ) : (
            <div className="mt-3 rounded-xl border-l-4 border-[#16a34a] bg-[#16a34a]/10 p-4">
              <p className="font-bold text-[#16a34a]">
                Option B — Document Proof <span className="text-xs font-semibold">(Selected)</span>
              </p>
              <p className="mt-1 text-sm text-gray-800">Upload documents to skip video requirement</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-[#16a34a]/40 bg-white p-3">
                  <p className="flex items-center gap-2 text-sm font-bold text-black">
                    <FileText className="size-4 text-[#16a34a]" /> Upload CV<span className="text-[#dc2626]">*</span>
                  </p>
                  <p className="text-[11px] text-gray-600">PDF, DOC, DOCX, JPG • max {MAX_DOC_MB}MB</p>
                  <Input
                    type="file"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg"
                    className="mt-2 h-9 text-xs text-black"
                    onChange={(e) => setCv(e.target.files?.[0] ?? null)}
                  />
                </div>
                <div className="rounded-lg border border-[#16a34a]/40 bg-white p-3">
                  <p className="flex items-center gap-2 text-sm font-bold text-black">
                    <BadgeCheck className="size-4 text-[#16a34a]" /> Upload Certificate<span className="text-[#dc2626]">*</span>
                  </p>
                  <p className="text-[11px] text-gray-600">
                    PDF, JPG, PNG • NVTI, COTVET, University Degree, Apprenticeship Letter • max {MAX_DOC_MB}MB
                  </p>
                  <Input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="mt-2 h-9 text-xs text-black"
                    onChange={(e) => setCertificate(e.target.files?.[0] ?? null)}
                  />
                </div>
              </div>
              <p className="mt-2 text-xs italic text-gray-700">Videos are optional with Option B.</p>
            </div>
          )}

          {/* Always shown */}
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-3 md:col-span-2">
              <p className="flex items-center gap-2 text-sm font-bold text-black">
                <ImageIcon className="size-4" /> Photo of your work
              </p>
              <p className="text-[11px] text-gray-600">Upload up to 4 photos — JPG/PNG — show your projects/finished work</p>
              <Input
                type="file"
                accept="image/jpeg,image/png"
                multiple
                className="mt-2 h-9 text-xs text-black"
                onChange={(e) => setPhotos(Array.from(e.target.files ?? []).slice(0, 4))}
              />
              {photos.length ? <p className="mt-1 text-[11px] text-[#16a34a]">{photos.length} photo(s) selected</p> : null}
            </div>
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-3">
              <p className="flex items-center gap-2 text-sm font-bold text-black">
                <MessageSquareOff className="size-4" /> No WhatsApp
              </p>
              <p className="text-[11px] text-gray-600">All communications are handled inside the FindMit app only</p>
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="bio" className="text-sm font-bold text-black">Short bio</Label>
              <Textarea
                id="bio"
                rows={3}
                maxLength={200}
                value={shortBio}
                onChange={(e) => setShortBio(e.target.value)}
                placeholder="Briefly describe your background and experience... (max 200 characters)"
                className="text-black placeholder:text-gray-500"
              />
              <p className="text-[11px] text-gray-600">{shortBio.length}/200</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="why" className="text-sm font-bold text-black">Why do you want to join?</Label>
              <Textarea
                id="why"
                rows={3}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Tell us about your motivation and why you want to become a Verified FindMit Graduate..."
                className="text-black placeholder:text-gray-500"
              />
            </div>
          </div>

          <div className="mt-3 space-y-1.5">
            <Label htmlFor="fmid" className="text-sm font-bold text-black">
              FindMit User ID<span className="text-[#dc2626]">*</span>
            </Label>
            <Input id="fmid" value={findmitId} maxLength={40} onChange={(e) => setFindmitId(e.target.value)} placeholder="e.g. FM-2024-12345" className="text-black placeholder:text-gray-500" />
            <p className="text-[11px] text-gray-600">
              Enter your FindMit User ID to connect your account inside the app.
            </p>
          </div>

          <div className="mt-4 rounded-xl border-2 border-[#FFD700] bg-[#FFD700]/15 p-3 text-sm font-semibold text-black">
            Verification fee: GHS {applicationFee.toLocaleString()} — one-time fee via FindMit Wallet / In-App Payment
          </div>

          <Button
            className="mt-4 h-12 w-full rounded-xl bg-[#16a34a] text-base font-bold text-white hover:bg-[#15803d]"
            disabled={saving}
            onClick={() => void submit()}
          >
            {saving ? <Loader2 className="mr-2 size-5 animate-spin" /> : <CheckCircle2 className="mr-2 size-5" />}
            {applicationFee > 0 ? `Submit Review for GHS ${applicationFee.toLocaleString()}` : "Submit Review (Free)"}
          </Button>
        </div>

        <p className="mx-auto mt-3 max-w-4xl text-center text-xs text-gray-700">
          Your data is secure and encrypted. We use this information only to verify your credentials for FindMit.
        </p>
      </div>
    </AppShell>
  );
}
