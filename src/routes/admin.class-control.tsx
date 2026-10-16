import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { TV_LABELS, TV_ORDER, fetchTvChannels, type TvChannelState } from "@/lib/tv-live";
import {
  deleteAd,
  fetchAdSettings,
  fetchAds,
  setAdPublished,
  updateAdSettings,
  uploadAd,
  type TvAdSettings,
  type TvFolderAd,
} from "@/lib/tv-ads";
import type { TvCategory } from "@/lib/social";

export const Route = createFileRoute("/admin/class-control")({
  head: () => ({
    meta: [
      { title: "Class Control Room — FindMit admin" },
      { name: "description", content: "Manage adverts and moving text for the five FindMit class TV channels." },
      { property: "og:title", content: "Class Control Room — FindMit admin" },
      { property: "og:description", content: "Adverts, breaks and live ticker for FindMit class TV." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ProtectedRoute allow={["admin"]} message="Class Control is for admins only">
      <ClassControlPage />
    </ProtectedRoute>
  ),
});

function ClassControlPage() {
  const [channels, setChannels] = useState<TvChannelState[]>([]);
  useEffect(() => {
    void fetchTvChannels().then(setChannels);
  }, []);
  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-4 pb-28">
      <div className="flex items-center gap-2">
        <Button asChild size="icon" variant="ghost">
          <Link to="/admin/posts" search={{ tab: "posts", room: undefined, mode: undefined }} aria-label="Back">
            <ArrowLeft />
          </Link>
        </Button>
        <h1 className="font-display text-xl font-black">Class Control Room</h1>
      </div>
      {TV_ORDER.map((cat) => (
        <FolderCard key={cat} folder={cat} lessons={channels.find((c) => c.category === cat)?.clips.length ?? 0} />
      ))}
    </main>
  );
}

function FolderCard({ folder, lessons }: { folder: TvCategory; lessons: number }) {
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <h2 className="mb-3 font-display text-lg font-black text-primary">{TV_LABELS[folder]}</h2>
      <Tabs defaultValue="adverts">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="lessons">Lessons</TabsTrigger>
          <TabsTrigger value="adverts">Adverts</TabsTrigger>
        </TabsList>
        <TabsContent value="lessons" className="pt-3 text-sm text-muted-foreground">
          {lessons} lesson video{lessons === 1 ? "" : "s"} in this folder. Upload and order lessons from the Post tab's TV Studio.
        </TabsContent>
        <TabsContent value="adverts" className="space-y-4 pt-3">
          <AdvertsPanel folder={folder} />
        </TabsContent>
      </Tabs>
    </section>
  );
}

function AdvertsPanel({ folder }: { folder: TvCategory }) {
  const [ads, setAds] = useState<TvFolderAd[]>([]);
  const [s, setS] = useState<TvAdSettings | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setAds(await fetchAds(folder, false));
    setS(await fetchAdSettings(folder));
  }, [folder]);
  useEffect(() => {
    void load();
  }, [load]);

  const save = async (patch: Partial<TvAdSettings>, msg: string) => {
    try {
      await updateAdSettings(folder, patch);
      toast.success(msg);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) await uploadAd(folder, f);
      toast.success("Advert uploaded — toggle Publish to air it");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  if (!s) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <>
      <div className="space-y-2">
        <Label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-sm font-semibold">
          <Upload className="size-4" /> {busy ? "Uploading…" : "Upload advert videos"}
          <input type="file" accept="video/*" multiple hidden disabled={busy} onChange={(e) => void onFiles(e.target.files)} />
        </Label>
        {ads.length === 0 ? (
          <p className="text-xs text-muted-foreground">No adverts yet.</p>
        ) : (
          <ul className="space-y-2">
            {ads.map((ad) => (
              <li key={ad.id} className="flex items-center gap-2 rounded-xl border p-2">
                <p className="min-w-0 flex-1 truncate text-sm">{ad.title ?? "Advert"}</p>
                <span className="text-xs text-muted-foreground">{ad.is_published ? "Published" : "Hidden"}</span>
                <Switch
                  checked={ad.is_published}
                  onCheckedChange={async (v) => {
                    await setAdPublished(ad.id, v);
                    await load();
                  }}
                  aria-label="Publish advert"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Delete advert"
                  onClick={async () => {
                    await deleteAd(ad);
                    await load();
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Break every (minutes)</Label>
          <Input type="number" min={1} value={s.ad_interval_minutes} onChange={(e) => setS({ ...s, ad_interval_minutes: Number(e.target.value) })} />
        </div>
        <div className="space-y-1">
          <Label>Ads per break</Label>
          <Input type="number" min={1} value={s.ads_per_break} onChange={(e) => setS({ ...s, ads_per_break: Number(e.target.value) })} />
        </div>
        <Button
          className="col-span-2"
          variant="secondary"
          onClick={() =>
            void save({ ad_interval_minutes: Math.max(1, s.ad_interval_minutes), ads_per_break: Math.max(1, s.ads_per_break) }, "Break settings saved")
          }
        >
          Save break settings
        </Button>
      </div>

      <div className="space-y-3 rounded-xl border bg-muted/40 p-3">
        <div className="flex items-center justify-between">
          <p className="font-display font-black">Moving Text Studio</p>
          <span className={`rounded-full px-2 py-0.5 text-[0.6rem] font-black ${s.moving_text_published ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground"}`}>
            {s.moving_text_published ? "LIVE" : "OFF AIR"}
          </span>
        </div>
        {s.moving_text_published && s.moving_text ? (
          <p className="truncate text-xs text-muted-foreground">On air: {s.moving_text}</p>
        ) : null}
        <Textarea value={s.moving_text_draft} placeholder="Type the scrolling message…" onChange={(e) => setS({ ...s, moving_text_draft: e.target.value })} />
        <div className="space-y-1">
          <Label>Speed ({s.moving_text_speed}s per loop — lower is faster)</Label>
          <Slider min={5} max={60} step={1} value={[s.moving_text_speed]} onValueChange={(v) => setS({ ...s, moving_text_speed: v[0] ?? 20 })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Position</Label>
            <Select value={s.moving_text_position} onValueChange={(v) => setS({ ...s, moving_text_position: v as "top" | "bottom" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="top">Top</SelectItem>
                <SelectItem value="bottom">Bottom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2 pb-2">
            <Switch checked={s.moving_text_enabled} onCheckedChange={(v) => setS({ ...s, moving_text_enabled: v })} id={`en-${folder}`} />
            <Label htmlFor={`en-${folder}`}>Enabled</Label>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="outline"
            onClick={() =>
              void save(
                { moving_text_draft: s.moving_text_draft, moving_text_speed: s.moving_text_speed, moving_text_position: s.moving_text_position, moving_text_enabled: s.moving_text_enabled },
                "Draft saved",
              )
            }
          >
            Save Draft
          </Button>
          <Button
            variant="destructive"
            disabled={!s.moving_text_draft.trim()}
            onClick={() =>
              void save(
                {
                  moving_text_draft: s.moving_text_draft,
                  moving_text: s.moving_text_draft,
                  moving_text_speed: s.moving_text_speed,
                  moving_text_position: s.moving_text_position,
                  moving_text_enabled: s.moving_text_enabled,
                  moving_text_published: true,
                },
                "Moving text is live",
              )
            }
          >
            Publish Live
          </Button>
          <Button variant="secondary" onClick={() => void save({ moving_text_published: false }, "Moving text taken off air")}>
            Unpublish
          </Button>
        </div>
      </div>
    </>
  );
}
