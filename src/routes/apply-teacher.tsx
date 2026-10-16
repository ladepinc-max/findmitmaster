import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, Camera, Check, Loader2, ScanFace, ShieldCheck, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRole } from "@/lib/roles";
import { compareFaces } from "@/lib/face-match";
import { startCamera } from "@/lib/webrtc-media";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/apply-teacher")({
  head: () => ({
    meta: [
      { title: "Apply for Teacher — FindMit" },
      { name: "description", content: "Apply to become a verified FindMit teacher with Ghana card and live face check." },
      { property: "og:title", content: "Apply for Teacher — FindMit" },
      { property: "og:description", content: "Submit your Ghana card, school and live face check to teach on FindMit." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ApplyTeacherPage,
});

const MIN_SCORE = 80;

function CardUpload({
  label,
  file,
  onFile,
}: {
  label: string;
  file: File | null;
  onFile: (file: File) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold">{label}</Label>
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-4 text-center">
        {preview ? (
          <img src={preview} alt={label} className="h-28 w-full rounded-xl object-cover" />
        ) : (
          <>
            <Upload className="size-5 text-primary" />
            <span className="text-xs text-muted-foreground">Tap to upload a clear photo</span>
          </>
        )}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const picked = event.target.files?.[0];
            if (picked) onFile(picked);
          }}
        />
      </label>
    </div>
  );
}

function ApplyTeacherPage() {
  const { user, profile } = useAuth();
  const { role, loading: roleLoading } = useRole();
  const navigate = useNavigate();

  const [name, setName] = useState(profile?.display_name ?? "");
  const [age, setAge] = useState("");
  const [school, setSchool] = useState("");
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [contact, setContact] = useState("+233");
  const [hod, setHod] = useState("+233");
  const [selfie, setSelfie] = useState<Blob | null>(null);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (roleLoading) return;
    if (role === "admin") void navigate({ to: "/admin/teacher-applications", replace: true });
    if (role === "teacher") void navigate({ to: "/settings", replace: true });
  }, [role, roleLoading, navigate]);

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  const validPhone = (value: string) => /^\+233\d{9}$/.test(value.replace(/\s/g, ""));

  const startSelfie = async () => {
    if (!front) {
      toast.error("Upload your Ghana card front first");
      return;
    }
    try {
      const stream = await startCamera({ facingMode: "user", width: 640, height: 480, audio: false });
      streamRef.current = stream;
      setCameraOn(true);
      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      }, 50);
    } catch {
      toast.error("Camera permission is required for face verification");
    }
  };

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !front) return;
    setChecking(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 480;
      canvas.height = video.videoHeight || 640;
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((value) => resolve(value), "image/jpeg", 0.88),
      );
      if (!blob) throw new Error("capture failed");
      const match = await compareFaces(front, blob);
      setSelfie(blob);
      setSelfieUrl(URL.createObjectURL(blob));
      setScore(match);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      setCameraOn(false);
      if (match >= MIN_SCORE) toast.success(`Face match ${match}% — verified`);
      else toast.error(`Face match ${match}% — needs at least ${MIN_SCORE}%. Try better lighting.`);
    } catch {
      toast.error("Face check failed — please try again");
    } finally {
      setChecking(false);
    }
  };

  const ageNumber = Number(age);
  const ready =
    name.trim().length > 1 &&
    ageNumber >= 18 &&
    school.trim().length > 1 &&
    Boolean(front && back && selfie) &&
    validPhone(contact) &&
    validPhone(hod) &&
    (score ?? 0) >= MIN_SCORE;

  const upload = async (bucket: string, file: Blob, suffix: string) => {
    const path = `${user!.id}/${Date.now()}-${suffix}.jpg`;
    const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: "image/jpeg" });
    if (error) throw error;
    return path;
  };

  const submit = async () => {
    if (!user || !ready || !front || !back || !selfie) return;
    setSubmitting(true);
    try {
      const [frontPath, backPath, selfiePath] = [
        await upload("ghana-cards", front, "front"),
        await upload("ghana-cards", back, "back"),
        await upload("facial-verification", selfie, "selfie"),
      ];
      const { error } = await supabase.from("teacher_applications").insert({
        user_id: user.id,
        name: name.trim(),
        age: ageNumber,
        current_school: school.trim(),
        ghana_card_front_url: frontPath,
        ghana_card_back_url: backPath,
        personal_contact: contact.replace(/\s/g, ""),
        hod_contact: hod.replace(/\s/g, ""),
        facial_verification_url: selfiePath,
        match_score: score ?? 0,
      });
      if (error) throw error;
      toast.success("Application sent — you will hear from the FindMit team");
      void navigate({ to: "/settings", replace: true });
    } catch (error) {
      console.error(error);
      toast.error("Could not send your application. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-lg bg-background pb-24">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-primary px-4 py-3 text-primary-foreground">
        <Link to="/settings" aria-label="Back" className="opacity-90 hover:opacity-100">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="font-display text-base font-bold">Apply for Teacher</h1>
        <span className="ml-auto flex items-center gap-1 rounded-full bg-white/15 px-2 py-1 text-[0.65rem] font-bold">
          <ShieldCheck className="size-3" /> Secure
        </span>
      </header>

      <div className="space-y-5 px-5 py-6">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs font-semibold">Full name</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ama Mensah" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Age (18+)</Label>
            <Input
              type="number"
              min={18}
              value={age}
              onChange={(event) => setAge(event.target.value)}
              placeholder="24"
            />
            {age && ageNumber < 18 ? (
              <p className="text-[0.65rem] font-semibold text-destructive">You must be 18 or older</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Current school</Label>
            <Input value={school} onChange={(event) => setSchool(event.target.value)} placeholder="Accra SHS" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <CardUpload label="Ghana card — front" file={front} onFile={setFront} />
          <CardUpload label="Ghana card — back" file={back} onFile={setBack} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Your contact</Label>
            <Input value={contact} onChange={(event) => setContact(event.target.value)} placeholder="+233201234567" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">HOD contact</Label>
            <Input value={hod} onChange={(event) => setHod(event.target.value)} placeholder="+233241234567" />
          </div>
        </div>

        <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ScanFace className="size-4 text-primary" /> Live facial verification
          </div>
          <p className="text-xs text-muted-foreground">
            We compare your live selfie with the photo on your Ghana card. You need at least {MIN_SCORE}% to submit.
          </p>

          {cameraOn ? (
            <>
              <div className="relative overflow-hidden rounded-xl bg-black">
                <video ref={videoRef} playsInline muted className="mx-auto aspect-[3/4] w-full max-w-56 -scale-x-100 object-cover" />
                <div className="pointer-events-none absolute inset-6 rounded-full border-2 border-dashed border-white/50" />
              </div>
              <Button type="button" className="w-full rounded-full" disabled={checking} onClick={() => void capture()}>
                {checking ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Camera className="mr-2 size-4" />}
                {checking ? "Comparing…" : "Capture & compare"}
              </Button>
            </>
          ) : (
            <>
              {selfieUrl ? (
                <img src={selfieUrl} alt="Your selfie" className="mx-auto h-32 w-28 rounded-xl object-cover" />
              ) : null}
              {score !== null ? (
                <div
                  className={cn(
                    "rounded-xl px-3 py-2 text-center text-sm font-bold",
                    score >= MIN_SCORE ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive",
                  )}
                >
                  Match score: {score}% {score >= MIN_SCORE ? "✅" : `— need ${MIN_SCORE}%`}
                </div>
              ) : null}
              <Button type="button" variant="secondary" className="w-full rounded-full" onClick={() => void startSelfie()}>
                <Camera className="mr-2 size-4" /> {score === null ? "Start face check" : "Retake"}
              </Button>
            </>
          )}
        </section>

        <Button
          type="button"
          className="h-12 w-full rounded-full text-base font-bold"
          disabled={!ready || submitting}
          onClick={() => void submit()}
        >
          {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Check className="mr-2 size-4" />}
          Submit teacher application
        </Button>
        <p className="text-center text-[0.65rem] text-muted-foreground">
          Your Ghana card and selfie stay private and are only seen by the FindMit review team.
        </p>
      </div>
    </main>
  );
}
