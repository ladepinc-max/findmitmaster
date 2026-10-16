import { useCallback, useEffect, useState } from "react";
import { Bell, BellRing, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createAlert,
  deleteAlert,
  fetchAlerts,
  fetchNotifications,
  markAllRead,
  requestPushPermission,
  setAlertActive,
  showPushNotification,
  subscribeToJobNotifications,
  type JobAlert,
  type JobNotification,
} from "@/lib/job-alerts";

interface Props {
  userId: string | undefined;
  /** Prefills a new alert with the user's current search term. */
  searchTerm: string;
}

export function JobAlertsButton({ userId, searchTerm }: Props) {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<JobAlert[] | null>(null);
  const [notifications, setNotifications] = useState<JobNotification[] | null>(null);
  const [pushOn, setPushOn] = useState(false);

  const unread = (notifications ?? []).filter((item) => !item.is_read).length;

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [nextAlerts, nextNotifications] = await Promise.all([
        fetchAlerts(userId),
        fetchNotifications(userId),
      ]);
      setAlerts(nextAlerts);
      setNotifications(nextNotifications);
    } catch (error) {
      console.error(error);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPushOn(Notification.permission === "granted");
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    return subscribeToJobNotifications(userId, (row) => {
      setNotifications((prev) => [row, ...(prev ?? [])]);
      toast.success(row.title, { description: row.body });
      showPushNotification(row.title, row.body);
    });
  }, [userId]);

  const togglePush = async (next: boolean) => {
    if (!next) {
      setPushOn(false);
      return;
    }
    const result = await requestPushPermission();
    if (result === "granted") {
      setPushOn(true);
      toast.success("Push notifications enabled");
    } else if (result === "denied") {
      toast.error("Notifications are blocked in your browser settings");
    } else {
      toast.error("Your browser does not support notifications");
    }
  };

  const openPanel = async () => {
    setOpen(true);
    await load();
    if (userId && unread > 0) {
      try {
        await markAllRead(userId);
        setNotifications((prev) => (prev ?? []).map((item) => ({ ...item, is_read: true })));
      } catch (error) {
        console.error(error);
      }
    }
  };

  if (!userId) return null;

  return (
    <>
      <Button variant="ghost" size="icon" className="relative" onClick={() => void openPanel()} aria-label="Job alerts">
        {unread > 0 ? <BellRing className="size-5" /> : <Bell className="size-5" />}
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Job alerts</DialogTitle>
            <DialogDescription>
              Get notified the moment a new job matches your skills or search.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Browser push notifications</p>
              <p className="text-xs text-muted-foreground">Alerts pop up even when this tab is in the background.</p>
            </div>
            <Switch checked={pushOn} onCheckedChange={(next) => void togglePush(next)} />
          </div>

          <Tabs defaultValue="alerts">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="alerts">My alerts</TabsTrigger>
              <TabsTrigger value="matches">Matches</TabsTrigger>
            </TabsList>

            <TabsContent value="alerts" className="space-y-3 pt-3">
              <AlertForm userId={userId} searchTerm={searchTerm} onDone={() => void load()} />
              {alerts === null ? (
                <Loader2 className="mx-auto my-6 size-5 animate-spin text-muted-foreground" />
              ) : alerts.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No alerts yet.</p>
              ) : (
                <ul className="space-y-2">
                  {alerts.map((alert) => (
                    <li key={alert.id} className="flex items-start gap-3 rounded-lg border border-border p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{alert.label}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {alert.keywords && <Badge variant="secondary">“{alert.keywords}”</Badge>}
                          {alert.skills.map((skill) => (
                            <Badge key={skill} variant="outline">
                              {skill}
                            </Badge>
                          ))}
                          {alert.job_type && <Badge variant="outline">{alert.job_type}</Badge>}
                          {alert.min_salary !== null && <Badge variant="outline">min {alert.min_salary}</Badge>}
                        </div>
                      </div>
                      <Switch
                        checked={alert.is_active}
                        onCheckedChange={async (next) => {
                          setAlerts((prev) =>
                            (prev ?? []).map((item) => (item.id === alert.id ? { ...item, is_active: next } : item)),
                          );
                          try {
                            await setAlertActive(alert.id, next);
                          } catch (error) {
                            console.error(error);
                            toast.error("Could not update alert");
                          }
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete alert"
                        onClick={async () => {
                          try {
                            await deleteAlert(alert.id);
                            setAlerts((prev) => (prev ?? []).filter((item) => item.id !== alert.id));
                          } catch (error) {
                            console.error(error);
                            toast.error("Could not delete alert");
                          }
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="matches" className="pt-3">
              {notifications === null ? (
                <Loader2 className="mx-auto my-6 size-5 animate-spin text-muted-foreground" />
              ) : notifications.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No matches yet. New jobs matching your alerts appear here.
                </p>
              ) : (
                <ul className="space-y-2">
                  {notifications.map((item) => (
                    <li key={item.id} className="rounded-lg border border-border p-3">
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.body}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {new Date(item.created_at).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AlertForm({
  userId,
  searchTerm,
  onDone,
}: {
  userId: string;
  searchTerm: string;
  onDone: () => void;
}) {
  const [keywords, setKeywords] = useState(searchTerm);
  const [skills, setSkills] = useState("");
  const [minSalary, setMinSalary] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setKeywords(searchTerm);
  }, [searchTerm]);

  const submit = async () => {
    const skillList = skills
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (!keywords.trim() && skillList.length === 0) {
      toast.error("Add a keyword or at least one skill");
      return;
    }
    setSaving(true);
    try {
      await createAlert(userId, {
        label: keywords.trim() || skillList.join(", "),
        keywords: keywords.trim(),
        skills: skillList,
        category: null,
        job_type: null,
        min_salary: minSalary ? Number(minSalary) : null,
      });
      setSkills("");
      setMinSalary("");
      toast.success("Alert saved");
      onDone();
    } catch (error) {
      console.error(error);
      toast.error("Could not save alert");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="space-y-1.5">
        <Label htmlFor="alert-keywords">Search keyword</Label>
        <Input
          id="alert-keywords"
          value={keywords}
          onChange={(event) => setKeywords(event.target.value)}
          placeholder="e.g. delivery driver"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="alert-skills">Skills (comma separated)</Label>
        <Input
          id="alert-skills"
          value={skills}
          onChange={(event) => setSkills(event.target.value)}
          placeholder="e.g. plumbing, welding"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="alert-salary">Minimum salary (optional)</Label>
        <Input
          id="alert-salary"
          type="number"
          inputMode="numeric"
          value={minSalary}
          onChange={(event) => setMinSalary(event.target.value)}
          placeholder="e.g. 500"
        />
      </div>
      <Button className="w-full" disabled={saving} onClick={() => void submit()}>
        {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
        Create alert
      </Button>
    </div>
  );
}
