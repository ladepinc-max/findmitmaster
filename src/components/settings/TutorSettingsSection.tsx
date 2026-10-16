import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Library } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AmaAvatar } from "@/components/tutor/AmaAvatar";
import { useRole } from "@/lib/roles";
import { updateTutorSettings, useTutorSettings } from "@/lib/tutor";

const LANGUAGES = [
  { id: "english", label: "English" },
  { id: "pidgin", label: "Pidgin" },
  { id: "twi", label: "Twi" },
];

/** Admin-only control for the AI tutor's name, picture and speaking style. */
export function TutorSettingsSection() {
  const { isAdmin } = useRole();
  const { settings, reload } = useTutorSettings();
  const [name, setName] = useState(settings.tutor_name);
  const [avatar, setAvatar] = useState(settings.avatar_url ?? "");
  const [greeting, setGreeting] = useState(settings.greeting);
  const [language, setLanguage] = useState(settings.language);
  const [trialDays, setTrialDays] = useState(String(settings.free_trial_days ?? 60));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(settings.tutor_name);
    setAvatar(settings.avatar_url ?? "");
    setGreeting(settings.greeting);
    setLanguage(settings.language);
    setTrialDays(String(settings.free_trial_days ?? 60));
  }, [settings]);

  if (!isAdmin) return null;

  const save = async () => {
    const days = Math.round(Number(trialDays));
    if (!Number.isFinite(days) || days < 0 || days > 3650) {
      toast.error("Free trial days must be between 0 and 3650");
      return;
    }
    setSaving(true);
    try {
      await updateTutorSettings({
        tutor_name: name.trim() || "Ama",
        avatar_url: avatar.trim() || null,
        greeting: greeting.trim(),
        language,
        free_trial_days: days,
      });
      toast.success("Tutor updated");
      await reload();
    } catch {
      toast.error("Could not save the tutor settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="px-6 pb-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        AI Tutor
      </h2>
      <div className="mt-3 space-y-4 rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center gap-4">
          <AmaAvatar src={avatar || null} name={name} size="sm" />
          <p className="text-sm text-muted-foreground">
            Change the tutor&apos;s name, picture and language for everyone.
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="tutor-name">Tutor name</Label>
          <Input id="tutor-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tutor-avatar">Picture link</Label>
          <Input
            id="tutor-avatar"
            placeholder="https://…  (leave empty for the default picture)"
            value={avatar}
            onChange={(e) => setAvatar(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tutor-greeting">Greeting</Label>
          <Input id="tutor-greeting" value={greeting} onChange={(e) => setGreeting(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Speaking style</Label>
          <div className="flex gap-2">
            {LANGUAGES.map((l) => (
              <Button
                key={l.id}
                type="button"
                size="sm"
                variant={language === l.id ? "default" : "outline"}
                onClick={() => setLanguage(l.id)}
              >
                {l.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="tutor-trial">Free trial for new students (days)</Label>
          <Input
            id="tutor-trial"
            type="number"
            min={0}
            max={3650}
            value={trialDays}
            onChange={(e) => setTrialDays(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            New students get free Practice and Ask Ama for this many days after they join. Use 0 for no trial.
          </p>
        </div>
        <Button className="w-full" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save tutor"}
        </Button>
        <Link to="/admin/vault" className="block">
          <Button variant="outline" className="w-full gap-2">
            <Library className="size-4" />
            GES Vault (JHS syllabus &amp; BECE)
          </Button>
        </Link>
      </div>
    </section>
  );
}
