import { useEffect, useState } from "react";
import { Play, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useRole } from "@/lib/roles";
import { updateTutorSettings, useTutorSettings } from "@/lib/tutor";
import { DEFAULT_VOICE_TUNING, speakLong, type VoiceCadence, type VoiceTuning } from "@/lib/ama-voice";

const SAMPLE =
  "Akwaaba! I am Ama, your FindMit tutor. Step 1: find 2/3 of GH¢15 for our WASSCE and BECE practice. Now, 2/3 × 15 = 10. Therefore, the answer is 10 Ghana cedis. Pay with MoMo.";

const CADENCES: { id: VoiceCadence; label: string }[] = [
  { id: "relaxed", label: "Relaxed teacher" },
  { id: "standard", label: "Standard" },
  { id: "brisk", label: "Brisk" },
];

/** Admin-only sliders for how Ama sounds, with a preview before saving for everyone. */
export function AmaVoiceTuning() {
  const { isAdmin } = useRole();
  const { settings, reload } = useTutorSettings();
  const [t, setT] = useState<VoiceTuning>(DEFAULT_VOICE_TUNING);
  const [sample, setSample] = useState(SAMPLE);
  const [playing, setPlaying] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const c = settings.voice_cadence;
    setT({
      rate: Number(settings.voice_rate ?? DEFAULT_VOICE_TUNING.rate),
      pitch: Number(settings.voice_pitch ?? DEFAULT_VOICE_TUNING.pitch),
      volume: Number(settings.voice_volume ?? DEFAULT_VOICE_TUNING.volume),
      cadence: c === "relaxed" || c === "standard" || c === "brisk" ? c : DEFAULT_VOICE_TUNING.cadence,
      phonetics: settings.voice_phonetics ?? DEFAULT_VOICE_TUNING.phonetics,
    });
  }, [settings]);

  if (!isAdmin) return null;

  const preview = () => {
    if (playing) {
      window.speechSynthesis?.cancel();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    speakLong(sample, () => setPlaying(false), t);
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateTutorSettings({
        voice_rate: t.rate,
        voice_pitch: t.pitch,
        voice_volume: t.volume,
        voice_cadence: t.cadence,
        voice_phonetics: t.phonetics,
      });
      toast.success("Ama's voice updated for everyone");
      await reload();
    } catch {
      toast.error("Could not save Ama's voice");
    } finally {
      setSaving(false);
    }
  };

  const slider = (key: "rate" | "pitch" | "volume", label: string, min: number, max: number, hint: string) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <Label>{label}</Label>
        <span className="font-mono text-xs text-muted-foreground">{t[key].toFixed(2)}</span>
      </div>
      <Slider
        data-no-pull
        min={min}
        max={max}
        step={0.01}
        value={[t[key]]}
        onValueChange={([v]) => setT((p) => ({ ...p, [key]: v ?? p[key] }))}
      />
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );

  return (
    <section className="px-6 pb-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ama&apos;s voice</h2>
      <div className="mt-3 space-y-5 rounded-xl border border-border bg-surface p-4">
        <p className="text-sm text-muted-foreground">
          Tune how Ama speaks. Play a preview first — students only hear changes after you tap Update.
        </p>
        {slider("rate", "Speed", 0.6, 1.3, "Lower is slower and more deliberate")}
        {slider("pitch", "Pitch", 0.7, 1.4, "Lower is deeper, higher is lighter")}
        {slider("volume", "Loudness", 0.3, 1, "How loud Ama speaks")}
        <div className="space-y-2">
          <Label>Cadence (pauses and rhythm)</Label>
          <div className="flex flex-wrap gap-2">
            {CADENCES.map((c) => (
              <Button
                key={c.id}
                type="button"
                size="sm"
                variant={t.cadence === c.id ? "default" : "outline"}
                onClick={() => setT((p) => ({ ...p, cadence: c.id }))}
              >
                {c.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Ghanaian pronunciation</p>
            <p className="text-[11px] text-muted-foreground">WASSCE, BECE, cedis, MoMo and maths read like a Ghanaian teacher</p>
          </div>
          <Switch checked={t.phonetics} onCheckedChange={(v) => setT((p) => ({ ...p, phonetics: v }))} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="voice-sample">Preview text</Label>
          <Input id="voice-sample" value={sample} onChange={(e) => setSample(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1 gap-2" onClick={preview}>
            {playing ? <Square className="size-4" /> : <Play className="size-4" />}
            {playing ? "Stop preview" : "Play preview"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setT(DEFAULT_VOICE_TUNING)}>
            Reset
          </Button>
        </div>
        <Button className="w-full" onClick={save} disabled={saving}>
          {saving ? "Updating…" : "Update Ama's voice"}
        </Button>
      </div>
    </section>
  );
}
