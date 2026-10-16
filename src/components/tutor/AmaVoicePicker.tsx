import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Play, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  autoPickVoice,
  getSavedVoiceURI,
  isAfricanVoice,
  listEnglishVoices,
  previewVoice,
  saveVoiceURI,
} from "@/lib/ama-voice";

/** Lets the student pick and hear the accent Ama speaks with on this phone. */
export function AmaVoicePicker({ onChange }: { onChange?: () => void }) {
  const [open, setOpen] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setVoices(listEnglishVoices());
    setSelected(getSavedVoiceURI());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    refresh();
    window.speechSynthesis.addEventListener?.("voiceschanged", refresh);
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", refresh);
  }, [refresh]);

  const african = useMemo(() => voices.filter(isAfricanVoice), [voices]);
  const others = useMemo(() => voices.filter((v) => !isAfricanVoice(v)), [voices]);
  const auto = useMemo(() => (open ? autoPickVoice() : null), [open, voices]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (uri: string | null) => {
    saveVoiceURI(uri);
    setSelected(uri);
    onChange?.();
    previewVoice(uri ? (voices.find((v) => v.voiceURI === uri) ?? null) : autoPickVoice());
  };

  const row = (v: SpeechSynthesisVoice) => (
    <div
      key={v.voiceURI}
      className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2"
    >
      <button
        type="button"
        onClick={() => choose(v.voiceURI)}
        className="min-w-0 flex-1 text-left"
      >
        <p className="truncate text-sm font-medium text-foreground">{v.name}</p>
        <p className="text-xs text-muted-foreground">{v.lang.replace("_", "-")}</p>
      </button>
      {selected === v.voiceURI ? <Check className="size-4 text-primary" /> : null}
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Test ${v.name}`}
        onClick={() => previewVoice(v)}
      >
        <Play className="size-4" />
      </Button>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Voice settings">
          <Settings2 className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ama's voice</DialogTitle>
          <DialogDescription>
            Pick the accent Ama speaks with. Tap play to hear a sample first.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Automatic</p>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
              <button type="button" onClick={() => choose(null)} className="min-w-0 flex-1 text-left">
                <p className="text-sm font-medium text-foreground">English (United States)</p>
                <p className="truncate text-xs text-muted-foreground">
                  {auto ? auto.name : "Using your phone's default English voice"}
                </p>
              </button>
              {selected === null ? <Check className="size-4 text-primary" /> : null}
              <Button
                variant="ghost"
                size="icon"
                aria-label="Test automatic voice"
                onClick={() => previewVoice(autoPickVoice())}
              >
                <Play className="size-4" />
              </Button>
            </div>
          </div>

          {african.length ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                West African &amp; African
              </p>
              {african.map(row)}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">No Ghanaian voice on this phone yet</p>
              <p className="mt-1">
                Android: Settings → Text-to-speech → Google Speech Services → Install voice data →
                English (Ghana).
              </p>
              <p className="mt-1">
                iPhone: Settings → Accessibility → Spoken Content → Voices → English → English
                (Nigeria).
              </p>
            </div>
          )}

          {others.length ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Other English voices
              </p>
              {others.map(row)}
            </div>
          ) : null}

          {!voices.length ? (
            <p className="text-xs text-muted-foreground">
              This phone or browser does not offer any speaking voices.
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
