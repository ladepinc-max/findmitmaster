import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Camera, Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useUsernameCheck, USERNAME_HINT, normalizeUsername } from "@/lib/username";
import { uploadAvatar } from "@/lib/profile";
import { ProfilePhotoCropper } from "@/components/profile/ProfilePhotoCropper";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Complete your profile — FindMit" },
      { name: "description", content: "Pick your username, photo and bio to finish setting up your FindMit account." },
      { property: "og:title", content: "Complete your profile — FindMit" },
      { property: "og:description", content: "Pick your username, photo and bio to finish setting up your FindMit account." },
    ],
  }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const { session, profile, loading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [website, setWebsite] = useState("");
  const [saving, setSaving] = useState(false);

  const check = useUsernameCheck(username);

  useEffect(() => {
    if (loading) return;
    if (!session) void navigate({ to: "/auth", replace: true });
    else if (profile) void navigate({ to: "/", replace: true });
  }, [loading, session, profile, navigate]);

  useEffect(() => {
    const meta = session?.user.user_metadata as
      | { full_name?: string; name?: string; username?: string }
      | undefined;
    const initial = meta?.full_name ?? meta?.name ?? "";
    setDisplayName((current) => current || initial);
    if (meta?.username) setUsername((current) => current || meta.username!);
  }, [session]);

  useEffect(() => {
    if (!photoFile) return;
    const url = URL.createObjectURL(photoFile);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  const canSubmit =
    Boolean(photoFile) && displayName.trim().length > 0 && check.status === "available" && !saving;

  const submit = async () => {
    if (!session?.user || !photoFile) return;
    setSaving(true);
    try {
      const photoPath = await uploadAvatar(session.user.id, photoFile);
      const meta = session.user.user_metadata as
        | { phone_number?: string; phone_verified?: boolean }
        | undefined;
      const { error } = await supabase.from("profiles").insert({
        id: session.user.id,
        username: normalizeUsername(username),
        display_name: displayName.trim(),
        photo_path: photoPath,
        bio: bio.trim() || null,
        website: website.trim() || null,
        contact_email: session.user.email ?? null,
        phone_number: meta?.phone_number ?? null,
        phone_verified: Boolean(meta?.phone_verified),
      });
      if (error) throw error;
      await refreshProfile();
      toast.success("Welcome to FindMit");
      void navigate({ to: "/", replace: true });
    } catch (error) {
      console.error(error);
      toast.error("Could not create your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-lg bg-background px-6 pb-16 pt-10">
      <h1 className="font-display text-2xl font-bold">Complete your profile</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        This is how people will find you on FindMit.
      </p>

      <div className="mt-8 flex flex-col items-center">
        <Button
          type="button"
          variant="ghost"
          onClick={() => fileRef.current?.click()}
          className="relative size-28 overflow-hidden rounded-full border-2 border-dashed border-border bg-secondary p-0"
          aria-label="Upload profile photo"
        >
          {photoPreview ? (
            <img src={photoPreview} alt="Profile preview" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center">
              <Camera className="size-7 text-muted-foreground" />
            </span>
          )}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { setPendingPhoto(e.target.files?.[0] ?? null); e.currentTarget.value = ""; }}
        />
        <p className="mt-3 text-xs text-muted-foreground">Profile photo · required</p>
      </div>
      <ProfilePhotoCropper file={pendingPhoto} onClose={() => setPendingPhoto(null)} onApply={setPhotoFile} />

      <div className="mt-8 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="name">Full name</Label>
          <Input
            id="name"
            value={displayName}
            maxLength={60}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <div className="relative">
            <Input
              id="username"
              value={username}
              maxLength={20}
              autoCapitalize="none"
              autoCorrect="off"
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              placeholder="username"
              className="pr-10"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              {check.status === "checking" ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              ) : check.status === "available" ? (
                <Check className="size-4 text-success" />
              ) : check.status === "taken" || check.status === "invalid" ? (
                <X className="size-4 text-destructive" />
              ) : null}
            </span>
          </div>
          <p
            className={
              check.status === "taken" || check.status === "invalid"
                ? "text-xs text-destructive"
                : check.status === "available"
                  ? "text-xs text-success"
                  : "text-xs text-muted-foreground"
            }
          >
            {check.message ?? USERNAME_HINT}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="bio">Bio</Label>
          <Textarea
            id="bio"
            value={bio}
            maxLength={150}
            rows={3}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell people what you're about"
          />
          <p className="text-right text-xs text-muted-foreground">{bio.length}/150</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="website">Website</Label>
          <Input
            id="website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://"
            inputMode="url"
          />
        </div>
      </div>

      <Button
        className="mt-8 h-12 w-full rounded-xl text-base font-semibold"
        disabled={!canSubmit}
        onClick={submit}
      >
        {saving ? "Creating your profile…" : "Complete"}
      </Button>
    </main>
  );
}
