import { useEffect, useState } from "react";
import { Bell, BellRing, Eye, Volume2, Vibrate, Radio } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import {
  DEFAULT_PREFS,
  enablePush,
  loadPrefs,
  permissionState,
  pushConfigured,
  savePrefs,
  syncPrefs,
  type NotificationPrefs,
} from "@/lib/NotificationService";

const ROWS: {
  key: keyof NotificationPrefs;
  label: string;
  hint: string;
  icon: typeof Bell;
}[] = [
  {
    key: "chatEnabled",
    label: "Chat notifications",
    hint: "Pop-up alerts for new messages, even when the app is closed",
    icon: BellRing,
  },
  { key: "soundEnabled", label: "Sound", hint: "Play your chat tone on new alerts", icon: Volume2 },
  { key: "vibrateEnabled", label: "Vibrate", hint: "Buzz your phone on new alerts", icon: Vibrate },
  {
    key: "previewEnabled",
    label: "Show message preview",
    hint: "Include the message text in the pop-up",
    icon: Eye,
  },
  {
    key: "liveEnabled",
    label: "Live class alerts",
    hint: "Tell me when a teacher starts a live class",
    icon: Radio,
  },
];

export function SettingsSection() {
  const { profile } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [permission, setPermission] = useState<string>("default");

  useEffect(() => {
    setPrefs(loadPrefs());
    setPermission(permissionState());
    if (profile?.id) void syncPrefs(profile.id).then(setPrefs);
  }, [profile?.id]);

  const update = (key: keyof NotificationPrefs, value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    void savePrefs(profile?.id, next);
  };

  const turnOnPush = async () => {
    const result = await enablePush(profile?.id);
    setPermission(result);
    if (result === "granted") toast.success("Push notifications are on");
    else if (result === "denied")
      toast.error("Notifications are blocked in your browser settings");
    else if (result === "open-in-new-tab")
      toast.error("Open FindMit in its own browser tab to allow notifications");
    else if (result === "unsupported") toast.error("This device doesn't support notifications");
  };

  return (
    <section className="px-6 pb-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Notifications
      </h2>

      {permission !== "granted" ? (
        <div className="mt-3 rounded-xl border border-border bg-surface px-4 py-3">
          <div className="flex items-start gap-3">
            <Bell className="mt-0.5 size-4 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-medium">Turn on pop-up notifications</p>
              <p className="text-xs text-muted-foreground">
                Get new messages and live classes on your screen even when FindMit is closed.
              </p>
            </div>
          </div>
          <Button className="mt-3 w-full" size="sm" onClick={() => void turnOnPush()}>
            Allow notifications
          </Button>
          {!pushConfigured() ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Alerts show while FindMit is open. Closed-app delivery needs the notification
              service finished in your project settings.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        {ROWS.map(({ key, label, hint, icon: Icon }) => (
          <div
            key={key}
            className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <Icon className="size-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{hint}</p>
              </div>
            </div>
            <Switch
              checked={prefs[key]}
              onCheckedChange={(checked) => update(key, checked)}
              aria-label={label}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
