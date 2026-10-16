import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronDown,
  CircleHelp,
  CloudUpload,
  CreditCard,
  Globe2,
  IdCard,
  Loader2,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { FindMitLogo } from "@/components/FindMitLogo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { useAppPrice } from "@/lib/pricing";
import { FINDMIT_MIN_MONTHLY_SALARY, submitCompanyVerification, uploadVerificationDoc } from "@/lib/verification";
import { payWithPaystack } from "@/lib/paystack";

export const Route = createFileRoute("/apply-company-verification")({
  component: ApplyCompanyVerification,
  head: () => ({
    meta: [
      { title: "Verified Employer Application | FindMit Ghana" },
      { name: "description", content: "Apply to become a verified FindMit employer in Ghana." },
      { property: "og:title", content: "Become a Verified Employer on FindMit" },
      { property: "og:description", content: "Join trusted companies hiring verified Ghanaian talent." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const INDUSTRIES = ["Technology / Software", "Construction", "Education", "Healthcare", "Hospitality", "Manufacturing", "Retail", "Other"];
const COMPANY_SIZES = ["1–10 employees", "11–50 employees", "51–200 employees", "201–500 employees", "500+ employees"];
const REGIONS = ["Greater Accra, Accra", "Ashanti, Kumasi", "Northern, Tamale", "Western, Takoradi", "Central, Cape Coast", "Eastern, Koforidua", "Volta, Ho", "Other"];
const DEFAULT_INDUSTRY = "Technology / Software";
const DEFAULT_COMPANY_SIZE = "51–200 employees";
const DEFAULT_REGION = "Greater Accra, Accra";

type UploadCardProps = {
  id: string;
  title: string;
  file: File | null;
  onChange: (file: File | null) => void;
};

function Field({ label, icon, children }: { label: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-bold text-verification-foreground">{label}</Label>
      <div className="relative">
        {icon ? <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-verification-muted">{icon}</span> : null}
        {children}
      </div>
    </div>
  );
}

function SelectField({ label, icon, value, options, onChange }: { label: string; icon: ReactNode; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <Field label={label} icon={icon}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full appearance-none rounded-md border border-verification-line bg-verification-input py-2 pl-10 pr-10 text-sm font-medium text-verification-foreground outline-none transition focus:border-verification-green focus:ring-2 focus:ring-verification-green/20"
      >
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-verification-muted" />
    </Field>
  );
}

function UploadCard({ id, title, file, onChange }: UploadCardProps) {
  return (
    <label htmlFor={id} className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-verification-muted/70 bg-verification-input px-3 py-3 text-center transition hover:border-verification-green hover:bg-verification-green/5">
      {file ? <Check className="mb-1.5 size-6 text-verification-green" /> : <CloudUpload className="mb-1.5 size-7 text-verification-muted" />}
      <span className="text-xs font-bold leading-tight text-verification-foreground">{file?.name ?? title}</span>
      <span className="mt-1 text-[10px] leading-tight text-verification-muted">PDF, PNG, JPG — max 10MB</span>
      <span className="mt-1 text-[10px] text-verification-muted">Drag &amp; drop or <span className="font-bold text-verification-blue">Browse file</span></span>
      <Input id={id} type="file" accept=".pdf,.jpg,.jpeg,.png" className="sr-only" onChange={(event) => onChange(event.target.files?.[0] ?? null)} />
    </label>
  );
}

function ApplyCompanyVerification() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { amount: applicationFee } = useAppPrice("company_application");
  const [form, setForm] = useState({
    companyName: "", tin: "", industry: DEFAULT_INDUSTRY, regionCity: DEFAULT_REGION, companySize: DEFAULT_COMPANY_SIZE, website: "",
    officialEmail: user?.email ?? "", ghanaCardNumber: "", phone: "", hrContactName: "", hrContactPosition: "", salaryMin: "", salaryMax: "", staffCount: "",
  });
  const [ssnit, setSsnit] = useState<File | null>(null);
  const [workersCompensation, setWorkersCompensation] = useState<File | null>(null);
  const [registration, setRegistration] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));
  const completedDetails = useMemo(() => Boolean(form.companyName.trim() && form.tin.trim() && form.officialEmail.trim() && form.phone.trim()), [form]);
  const completedCompliance = Boolean(ssnit && workersCompensation && registration && confirmed);

  const submit = async () => {
    if (!user) {
      toast.error("Sign in first");
      return;
    }
    if (!completedDetails || !form.ghanaCardNumber.trim() || !form.hrContactName.trim() || !form.hrContactPosition.trim()) {
      toast.error("Complete all required company and HR details");
      return;
    }
    const salaryMin = Number(form.salaryMin);
    const salaryMax = Number(form.salaryMax);
    const staffCount = Number(form.staffCount);
    if (!Number.isFinite(salaryMin) || salaryMin < FINDMIT_MIN_MONTHLY_SALARY) {
      toast.error(`Minimum salary must be at least GHS ${FINDMIT_MIN_MONTHLY_SALARY}`);
      return;
    }
    if (!Number.isFinite(salaryMax) || salaryMax < salaryMin) {
      toast.error("Enter a valid upper salary amount");
      return;
    }
    if (!Number.isInteger(staffCount) || staffCount < 1) {
      toast.error("Enter the number of staff");
      return;
    }
    if (!ssnit || !workersCompensation || !registration) {
      toast.error("Upload all three required compliance documents");
      return;
    }
    if (!confirmed) {
      toast.error("Confirm the verification policy and data agreement");
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
      const [ssnitPath, workersPath, registrationPath] = await Promise.all([
        uploadVerificationDoc(user.id, ssnit, "ssnit-clearance"),
        uploadVerificationDoc(user.id, workersCompensation, "workers-compensation"),
        uploadVerificationDoc(user.id, registration, "company-registration-ghana-card"),
      ]);
      await submitCompanyVerification({
        userId: user.id,
        ...form,
        salaryMin,
        salaryMax,
        staffCount,
        ssnitProofPath: ssnitPath,
        workersCompensationPath: workersPath,
        registrationGhanaCardPath: registrationPath,
      });
      toast.success("Payment received — your application is under review");
      void navigate({ to: "/jobs", search: { tab: "ghana" } as never });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit your application");
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "h-11 border-verification-line bg-verification-input pl-10 text-sm font-medium text-verification-foreground placeholder:text-verification-muted shadow-none focus-visible:border-verification-green focus-visible:ring-verification-green/20";

  return (
    <AppShell wide>
      <main className="min-h-screen bg-verification-canvas px-3 py-5 text-verification-foreground sm:px-6 sm:py-10">
        <section className="mx-auto max-w-6xl overflow-hidden rounded-xl bg-verification-surface shadow-xl shadow-verification-foreground/10">
          <div className="px-5 pb-5 pt-5 sm:px-10 sm:pt-6 lg:px-12">
            <div className="flex items-start justify-between gap-4">
              <FindMitLogo size="lg" linkToHome />
              <Button type="button" variant="ghost" className="mt-2 gap-2 text-verification-muted hover:bg-verification-input hover:text-verification-foreground" onClick={() => toast.info("Need help? Contact the FindMit verification team inside Chat.") }>
                <CircleHelp className="size-5" /> <span className="hidden sm:inline">Help</span>
              </Button>
            </div>

            <ol className="mt-1 grid grid-cols-3" aria-label="Application progress">
              {[
                { number: 1, title: "Company Details", active: true, done: completedDetails },
                { number: 2, title: "Compliance", active: completedDetails, done: completedCompliance },
                { number: 3, title: "Submit", active: completedCompliance, done: false },
              ].map((step) => (
                <li key={step.number} className="relative border-b-4 border-verification-line pb-3 first:border-verification-green">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <span className={`grid size-8 shrink-0 place-items-center rounded-full border text-sm font-bold ${step.active ? "border-verification-green bg-verification-green text-verification-surface" : "border-verification-line text-verification-muted"}`}>
                      {step.done ? <Check className="size-5" /> : step.number}
                    </span>
                    <span className={`text-xs font-bold leading-tight sm:text-base ${step.active ? "text-verification-foreground" : "text-verification-muted"}`}><span className="block">Step {step.number}</span>{step.title}</span>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-3xl font-extrabold tracking-normal text-verification-foreground sm:text-4xl">Become a Verified Employer on FindMit</h1>
                  <p className="mt-1 text-sm text-verification-muted sm:text-base">Join trusted companies hiring verified Ghanaian graduates. Verification takes 24–48 hours.</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-verification-green/10 px-3 py-1.5 text-xs font-bold text-verification-green"><BadgeCheck className="size-4" /> Secure • Verified</span>
              </div>

              <div className="mt-6 flex items-center gap-2 border-b border-verification-line pb-2">
                <Building2 className="size-5" /> <h2 className="text-lg font-extrabold tracking-normal">Company Details</h2>
              </div>
              <div className="mt-4 grid gap-x-8 gap-y-4 md:grid-cols-2">
                <Field label="Company Name*" icon={<Building2 className="size-4" />}><Input value={form.companyName} onChange={(e) => set("companyName")(e.target.value)} placeholder="e.g. Acme Ghana Ltd" className={inputClass} /></Field>
                <Field label="TIN*" icon={<CreditCard className="size-4" />}><Input value={form.tin} onChange={(e) => set("tin")(e.target.value)} placeholder="e.g. C0001234567" className={inputClass} /></Field>
                <SelectField label="Industry*" icon={<BriefcaseBusiness className="size-4" />} value={form.industry} options={INDUSTRIES} onChange={set("industry")} />
                <SelectField label="Region / City*" icon={<MapPin className="size-4" />} value={form.regionCity} options={REGIONS} onChange={set("regionCity")} />
                <SelectField label="Company Size*" icon={<UsersRound className="size-4" />} value={form.companySize} options={COMPANY_SIZES} onChange={set("companySize")} />
                <Field label="Website" icon={<Globe2 className="size-4" />}><Input type="url" value={form.website} onChange={(e) => set("website")(e.target.value)} placeholder="https://www.company.com" className={inputClass} /></Field>
                <Field label="Official Email*" icon={<Mail className="size-4" />}><Input type="email" value={form.officialEmail} onChange={(e) => set("officialEmail")(e.target.value)} placeholder="hr@company.com" className={inputClass} /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Ghana Card Number*" icon={<IdCard className="size-4" />}><Input value={form.ghanaCardNumber} onChange={(e) => set("ghanaCardNumber")(e.target.value)} placeholder="GHA-123456789-0" className={inputClass} /></Field>
                  <Field label="Phone*" icon={<Phone className="size-4" />}><Input type="tel" value={form.phone} onChange={(e) => set("phone")(e.target.value)} placeholder="+233 20 000 0000" className={inputClass} /></Field>
                </div>
              </div>

              <div className="mt-7 grid gap-8 border-t border-verification-line pt-5 lg:grid-cols-2">
                <section>
                  <div className="mb-4 flex items-center gap-2"><UserRound className="size-5" /><h2 className="text-lg font-extrabold tracking-normal">HR Contact Person</h2></div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Full Name*" icon={<UserRound className="size-4" />}><Input value={form.hrContactName} onChange={(e) => set("hrContactName")(e.target.value)} placeholder="e.g. Ama Serwaa" className={inputClass} /></Field>
                    <Field label="Position*" icon={<BriefcaseBusiness className="size-4" />}><Input value={form.hrContactPosition} onChange={(e) => set("hrContactPosition")(e.target.value)} placeholder="e.g. HR Manager" className={inputClass} /></Field>
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_0.7fr]">
                    <Field label="Salary From (GHS)*"><Input inputMode="numeric" value={form.salaryMin} onChange={(e) => set("salaryMin")(e.target.value)} placeholder="5,000" className="h-11 border-verification-line bg-verification-input text-verification-foreground shadow-none" /></Field>
                    <Field label="Salary To (GHS)*"><Input inputMode="numeric" value={form.salaryMax} onChange={(e) => set("salaryMax")(e.target.value)} placeholder="15,000" className="h-11 border-verification-line bg-verification-input text-verification-foreground shadow-none" /></Field>
                    <Field label="Number of staff*"><Input inputMode="numeric" value={form.staffCount} onChange={(e) => set("staffCount")(e.target.value)} placeholder="120" className="h-11 border-verification-line bg-verification-input text-verification-foreground shadow-none" /></Field>
                  </div>
                </section>

                <section>
                  <div className="mb-4 flex items-center gap-2"><ShieldCheck className="size-5" /><h2 className="text-lg font-extrabold tracking-normal">Employment &amp; Compliance</h2></div>
                  <p className="mb-3 text-sm font-bold">Required Documents</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <UploadCard id="ssnit" title="SSNIT Clearance Certificate" file={ssnit} onChange={setSsnit} />
                    <UploadCard id="workers" title="Insurance / Workers' Compensation" file={workersCompensation} onChange={setWorkersCompensation} />
                    <UploadCard id="registration" title="Registration + Ghana Card" file={registration} onChange={setRegistration} />
                  </div>
                </section>
              </div>

              <div className="mt-6 flex flex-col gap-3 rounded-lg border border-verification-line bg-verification-fee px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3"><ShieldCheck className="size-6 text-verification-green" /><div><p className="font-extrabold">Verification fee: ¢{applicationFee.toLocaleString()}</p><p className="text-xs text-verification-muted">One-time employer verification fee via FindMit Wallet / In-App Payment</p></div></div>
                <span className="text-xs font-bold text-verification-green">Secure review</span>
              </div>
            </div>
          </div>

          <footer className="flex flex-col gap-4 border-t border-verification-line bg-verification-input px-5 py-4 sm:px-10 lg:flex-row lg:items-center lg:justify-between lg:px-12">
            <label className="flex max-w-2xl cursor-pointer items-start gap-3 text-xs leading-relaxed text-verification-foreground sm:text-sm">
              <Checkbox checked={confirmed} onCheckedChange={(value) => setConfirmed(value === true)} className="mt-0.5 border-verification-muted data-[state=checked]:bg-verification-green data-[state=checked]:text-verification-surface" />
              <span>I confirm the information provided is accurate and I agree to the <span className="font-semibold text-verification-blue underline">Verification Policy &amp; Data Processing Agreement.</span></span>
            </label>
            <Button className="h-12 shrink-0 gap-2 bg-verification-green px-8 font-bold text-verification-surface hover:bg-verification-green/90" disabled={saving} onClick={() => void submit()}>
              {saving ? <Loader2 className="size-5 animate-spin" /> : <Check className="size-5" />} {applicationFee > 0 ? `Submit Review for GHS ${applicationFee.toLocaleString()}` : "Submit Review (Free)"}
            </Button>
          </footer>
        </section>
      </main>
    </AppShell>
  );
}