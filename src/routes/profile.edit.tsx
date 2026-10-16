import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { USERNAME_HINT, normalizeUsername, useUsernameCheck } from "@/lib/username";
import { normalizeWebsite, uploadAvatar } from "@/lib/profile";
import { ProfilePhotoCropper } from "@/components/profile/ProfilePhotoCropper";

export const Route = createFileRoute("/profile/edit")({
  head: () => ({
    meta: [
      { title: "Edit profile — FindMit" },
      { name: "description", content: "Update your FindMit photo, name, username, bio and links." },
      { property: "og:title", content: "Edit profile — FindMit" },
      {
        property: "og:description",
        content: "Update your FindMit photo, name, username, bio and links.",
      },
    ],
  }),
  component: EditProfilePage,
});

function EditProfilePage() {
  const { profile, refreshProfile } = useAuth();
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

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name);
    setUsername(profile.username);
    setBio(profile.bio ?? "");
    setWebsite(profile.website ?? "");
  }, [profile]);

  useEffect(() => {
    if (!photoFile) return;
    const url = URL.createObjectURL(photoFile);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  const usernameChanged = profile ? normalizeUsername(username) !== profile.username : false;
  const check = useUsernameCheck(usernameChanged ? username : "", profile?.id);

  if (!profile) return null;

  const canSave =
    displayName.trim().length > 0 &&
    (!usernameChanged || check.status === "available") &&
    !saving;

  const save = async () => {
    setSaving(true);
    try {
      let photoPath = profile.photo_path;
      if (photoFile) photoPath = await uploadAvatar(profile.id, photoFile);

      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: displayName.trim(),
          username: normalizeUsername(username),
          bio: bio.trim() || null,
          website: normalizeWebsite(website),
          photo_path: photoPath,
        })
        .eq("id", profile.id);
      if (error) throw error;

      await refreshProfile();
      toast.success("Profile updated");
      void navigate({ to: "/profile" });
    } catch (error) {
      console.error(error);
      toast.error("Could not save your changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-lg bg-background pb-16">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-surface/95 px-4 py-3 backdrop-blur">
        <Link to="/profile" aria-label="Back" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="font-display text-base font-bold">Edit profile</h1>
        <Button size="sm" disabled={!canSave} onClick={save}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </header>

      <div className="flex flex-col items-center py-6">
        <Button type="button" variant="ghost" onClick={() => fileRef.current?.click()} className="size-24 rounded-full p-0" aria-label="Change profile photo">
          {photoPreview ? (
            <img src={photoPreview} alt="New profile preview" className="size-24 rounded-full object-cover" />
          ) : (
            <UserAvatar photoPath={profile.photo_path} name={profile.display_name} className="size-24" />
          )}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setPendingPhoto(file);
            e.currentTarget.value = "";
          }}
        />
        <Button
          type="button"
          variant="link"
          onClick={() => fileRef.current?.click()}
          className="mt-2 text-sm font-medium text-accent"
        >
          Change photo
        </Button>
      </div>
      <ProfilePhotoCropper file={pendingPhoto} onClose={() => setPendingPhoto(null)} onApply={setPhotoFile} />

      <div className="space-y-5 px-6">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={displayName} maxLength={60} onChange={(e) => setDisplayName(e.target.value)} />
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
              className="pr-10"
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
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
                : "text-xs text-muted-foreground"
            }
          >
            {check.message ?? USERNAME_HINT}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="bio">Bio</Label>
          <Textarea id="bio" value={bio} rows={3} maxLength={150} onChange={(e) => setBio(e.target.value)} />
          <p className="text-right text-xs text-muted-foreground">{bio.length}/150</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="website">Website</Label>
          <Input id="website" value={website} inputMode="url" onChange={(e) => setWebsite(e.target.value)} />
        </div>
      </div>
    </main>
  );
}
