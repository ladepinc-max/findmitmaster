import { useEffect, useRef, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Bell, MessageCircle, Phone, Play, Smartphone, Square, Vibrate } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  CALL_TONES,
  CHAT_TONES,
  CUSTOM_CALL_KEY,
  CUSTOM_CHAT_KEY,
  getCallToneName,
  getCallToneUrl,
  getChatToneName,
  getChatToneUrl,
  getVibrate,
  getVolume,
  pickNativeRingtone,
  playTone,
  saveCallTone,
  saveChatTone,
  saveCustomAudio,
  saveVibrate,
  saveVolume,
  startRingtone,
  stopRingtone,
  type ToneOption,
} from "@/lib/sounds";

export const Route = createFileRoute("/assign-sounds")({
  head: () => ({
    meta: [
      { title: "Assign Sounds — FindMit" },
      {
        name: "description",
        content: "Choose your FindMit chat notification sound and call ringtone, volume and vibration.",
      },
      { property: "og:title", content: "Assign Sounds — FindMit" },
      {
        property: "og:description",
        content: "Choose your FindMit chat notification sound and call ringtone, volume and vibration.",
      },
    ],
  }),
  component: AssignSoundsPage,
});

function AssignSoundsPage() {
  const router = useRouter();
  const [volume, setVolume] = useState(0.8);
  const [vibrate, setVibrate] = useState(true);

  useEffect(() => {
    setVolume(getVolume());
    setVibrate(getVibrate());
    return () => stopRingtone();
  }, []);

  return (
    <AppShell>
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button
          type="button"
          aria-label="Go back"
          onClick={() => router.history.back()}
          className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="font-display text-lg font-bold">Assign Sounds</h1>
        <Bell className="ml-auto size-5 text-muted-foreground" />
      </header>

      <div className="space-y-4 p-4">
        <ToneCard
          title="Chat Notification Sound"
          icon={<MessageCircle className="size-5 text-primary" />}
          options={CHAT_TONES}
          customKey={CUSTOM_CHAT_KEY}
          loopPreview={false}
          initialUrl={getChatToneUrl()}
          initialName={getChatToneName()}
          onSave={saveChatTone}
          volume={volume}
        />

        <ToneCard
          title="Call Ringtone"
          icon={<Phone className="size-5 text-primary" />}
          options={CALL_TONES}
          customKey={CUSTOM_CALL_KEY}
          loopPreview
          initialUrl={getCallToneUrl()}
          initialName={getCallToneName()}
          onSave={saveCallTone}
          volume={volume}
        />

        <Card className="space-y-5 p-4">
          <div>
            <Label className="text-sm font-semibold">Volume</Label>
            <Slider
              className="mt-3"
              value={[Math.round(volume * 100)]}
              min={0}
              max={100}
              step={5}
              onValueChange={([v]) => setVolume((v ?? 80) / 100)}
              onValueCommit={([v]) => {
                const next = (v ?? 80) / 100;
                saveVolume(next);
                void playTone(getChatToneUrl(), next);
              }}
            />
            <p className="mt-1 text-xs text-muted-foreground">{Math.round(volume * 100)}%</p>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="vibrate" className="flex items-center gap-2 text-sm font-semibold">
              <Vibrate className="size-4" /> Vibrate
            </Label>
            <Switch
              id="vibrate"
              checked={vibrate}
              onCheckedChange={(next) => {
                setVibrate(next);
                saveVibrate(next);
                if (next) navigator.vibrate?.(200);
              }}
            />
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function ToneCard({
  title,
  icon,
  options,
  customKey,
  loopPreview,
  initialUrl,
  initialName,
  onSave,
  volume,
}: {
  title: string;
  icon: React.ReactNode;
  options: ToneOption[];
  customKey: string;
  loopPreview: boolean;
  initialUrl: string;
  initialName: string;
  onSave: (url: string, name: string) => void;
  volume: number;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selected, setSelected] = useState(initialUrl);
  const [name, setName] = useState(initialName);
  const [customName, setCustomName] = useState<string | null>(
    initialUrl.startsWith("custom:") ? initialName : null,
  );
  const [previewing, setPreviewing] = useState<string | null>(null);

  const preview = async (url: string) => {
    if (previewing === url) {
      stopRingtone();
      setPreviewing(null);
      return;
    }
    stopRingtone();
    if (loopPreview) {
      await startRingtone(url, volume);
      setPreviewing(url);
    } else {
      setPreviewing(null);
      await playTone(url, volume);
    }
  };

  const pickFromPhone = async () => {
    const native = await pickNativeRingtone();
    if (native) {
      setSelected(native.uri);
      setName(native.name);
      setCustomName(native.name);
      return;
    }
    inputRef.current?.click();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      await saveCustomAudio(customKey, file);
      setSelected(`custom:${customKey}`);
      setName(file.name);
      setCustomName(file.name);
      toast.success("Sound added from your phone");
    } catch {
      toast.error("Could not read that audio file");
    }
  };

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="font-display text-base font-bold">{title}</h2>
      </div>

      <div className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Current</p>
          <p className="truncate text-sm font-medium">{name}</p>
        </div>
        <Button size="icon" variant="ghost" aria-label="Play current sound" onClick={() => void preview(selected)}>
          {previewing === selected ? <Square className="size-4" /> : <Play className="size-4" />}
        </Button>
      </div>

      <Button variant="secondary" className="w-full" onClick={() => void pickFromPhone()}>
        <Smartphone className="size-4" /> Pick from phone
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        hidden
        onChange={(e) => void onFile(e.target.files?.[0])}
      />

      <RadioGroup value={selected} onValueChange={setSelected} className="space-y-1">
        {customName ? (
          <ToneRow
            id={`custom:${customKey}`}
            label={customName}
            previewing={previewing === `custom:${customKey}`}
            onPreview={() => void preview(`custom:${customKey}`)}
            onSelectName={() => setName(customName)}
          />
        ) : null}
        {options.map((option) => (
          <ToneRow
            key={option.id}
            id={`default:${option.id}`}
            label={option.label}
            previewing={previewing === `default:${option.id}`}
            onPreview={() => void preview(`default:${option.id}`)}
            onSelectName={() => setName(option.label)}
          />
        ))}
      </RadioGroup>

      <Button
        className="w-full"
        onClick={() => {
          stopRingtone();
          onSave(selected, name);
          toast.success(`${title} saved`);
        }}
      >
        Save
      </Button>
    </Card>
  );
}

function ToneRow({
  id,
  label,
  previewing,
  onPreview,
  onSelectName,
}: {
  id: string;
  label: string;
  previewing: boolean;
  onPreview: () => void;
  onSelectName: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-1 py-2">
      <RadioGroupItem value={id} id={id} onClick={onSelectName} />
      <Label htmlFor={id} className="flex-1 truncate text-sm font-normal">
        {label}
      </Label>
      <Button size="icon" variant="ghost" aria-label={`Preview ${label}`} onClick={onPreview}>
        {previewing ? <Square className="size-4" /> : <Play className="size-4" />}
      </Button>
    </div>
  );
}
