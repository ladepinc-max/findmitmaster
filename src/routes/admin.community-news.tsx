import { fetchLiveAds, type ShopAd } from "@/lib/shop-ads";
import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { NewsMedia } from "@/components/news/NewsMedia";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { burnExistingNews } from "@/lib/news-watermark";
import { newsMediaUrl, NEWS_BUCKET } from "@/lib/community-news";
import { Input } from "@/components/ui/input";
import { useRole } from "@/lib/roles";
import { timeAgo } from "@/lib/news";
import { fetchPendingNews, reviewNews, type CommunityNews } from "@/lib/community-news";

export const Route = createFileRoute("/admin/community-news")({
  head: () => ({
    meta: [
      { title: "Review Community News — FindMit admin" },
      { name: "description", content: "Watch, approve or reject community news before it is published on FindMit." },
      { property: "og:title", content: "Review Community News — FindMit admin" },
      { property: "og:description", content: "Moderate community news reports and attach sponsored ads." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReviewPage,
});

function ReviewPage() {
  const { isAdmin, loading } = useRole();
  const [items, setItems] = useState<CommunityNews[] | null>(null);

  useEffect(() => {
    if (isAdmin) void fetchPendingNews().then(setItems);
  }, [isAdmin]);

  if (loading) return <AppShell><div className="flex justify-center py-20"><Loader2 className="size-6 animate-spin" /></div></AppShell>;
  if (!isAdmin) return <AppShell><p className="p-8 text-center">Admins only.</p></AppShell>;

  return (
    <AppShell>
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-2">
          <Link to="/home" aria-label="Back" className="rounded-full bg-muted p-2"><ArrowLeft className="size-5" /></Link>
          <h1 className="font-display text-xl font-bold">Community News queue</h1>
        </div>
        {items === null ? <Loader2 className="mx-auto size-6 animate-spin" /> : items.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground">Nothing waiting for review.</p>
        ) : items.map((n) => <ReviewCard key={n.id} news={n} onDone={() => setItems((l) => (l ?? []).filter((x) => x.id !== n.id))} />)}
      </div>
    </AppShell>
  );
}

function ReviewCard({ news, onDone }: { news: CommunityNews; onDone: () => void }) {
  const { user } = useAuth();
  const [mediaPath, setMediaPath] = useState(news.media_path);
  const [watermarked, setWatermarked] = useState(news.watermarked);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [pickedImage, setPickedImage] = useState(false);

  async function upgradeMedia() {
    if (!user) return;
    setBusy(true);
    try {
      const url = await newsMediaUrl(mediaPath);
      if (!url) throw new Error("Media unavailable");
      const response = await fetch(url);
      if (!response.ok) throw new Error("Media unavailable");
      const result = await burnExistingNews(await response.blob(), news.media_type);
      const path = `${user.id}/${crypto.randomUUID()}.${result.type.includes("mp4") ? "mp4" : news.media_type === "photo" ? "jpg" : "webm"}`;
      const { error: uploadError } = await supabase.storage.from(NEWS_BUCKET).upload(path, result, { contentType: result.type });
      if (uploadError) throw uploadError;
      const { error } = await supabase.rpc("set_news_watermarked_media", { _id: news.id, _path: path });
      if (error) throw error;
      setMediaPath(path); setWatermarked(true);
      toast.success("FindMit watermark burned into the recording");
      if (news.status === "approved") onDone();
    } catch { toast.error("Could not watermark this recording. Please keep this screen open and try again."); }
    finally { setBusy(false); }
  }

  async function uploadSponsor(file: File | undefined) {
    if (!user || !file || !file.type.startsWith("image/")) return;
    setBusy(true);
    try {
      const path = `${user.id}/sponsor-${crypto.randomUUID()}.${file.name.split(".").pop() || "jpg"}`;
      const { error: uploadError } = await supabase.storage.from(NEWS_BUCKET).upload(path, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      const { error } = await supabase.rpc("set_news_sponsor_image", { _id: news.id, _path: path });
      if (error) throw error;
      setImagePreview(await newsMediaUrl(path)); setPickedImage(true); setAd((current) => ({ ...current, link: "" }));
    } catch { toast.error("Could not upload the sponsor photo"); }
    finally { setBusy(false); }
  }
  const [ad, setAd] = useState({ title: "", tagline: "", cta: "", link: "", rating: "" });
  const [busy, setBusy] = useState(false);
  const [liveAds, setLiveAds] = useState<ShopAd[]>([]);
  useEffect(() => { void fetchLiveAds().then(setLiveAds).catch(() => undefined); }, []);
  const pickAd = (id: string) => {
    const a = liveAds.find((x) => x.id === id);
    if (a) { setPickedImage(a.media_type === "image"); setAd((cur) => ({ ...cur, title: a.title, tagline: a.caption ?? "", cta: "View offer", link: `/ad/${a.id}` })); void import("@/lib/shop-ads").then(({ adMediaUrl }) => adMediaUrl(a.media_path)).then(setImagePreview); }
  };
  const set = (k: keyof typeof ad) => (e: React.ChangeEvent<HTMLInputElement>) => setAd((a) => ({ ...a, [k]: e.target.value }));

  async function act(approve: boolean) {
    if (approve && ad.title.trim() && !pickedImage) { toast.error("Pick a photo advert or add a sponsor image first"); return; }
    setBusy(true);
    try {
      const rating = Number(ad.rating);
      await reviewNews(news.id, approve, approve ? { ...ad, rating: ad.rating && rating >= 0 && rating <= 5 ? rating : null } : undefined);
      toast.success(approve ? "Published" : "Rejected — the reporter has been notified");
      onDone();
    } catch {
      toast.error("Could not save the decision");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card">
      <NewsMedia path={mediaPath} type={news.media_type} controls className="aspect-video w-full" />
      <div className="space-y-2 p-4">
        {!watermarked ? <div className="space-y-2">
          <p className="text-sm text-destructive">Older recording — add the permanent FindMit watermark before publishing. Video processing takes the length of the video; keep this page open.</p>
          <Button onClick={() => void upgradeMedia()} disabled={busy}>{busy ? "Processing…" : "Burn FindMit watermark"}</Button>
        </div> : null}
        <p className="text-xs font-bold uppercase text-primary">{news.community_name}</p>
        <h2 className="font-bold">{news.title}</h2>
        {news.description ? <p className="text-sm text-muted-foreground">{news.description}</p> : null}
        <p className="text-xs text-muted-foreground">By {news.author?.display_name || news.author?.username || "user"} · {timeAgo(news.created_at)}</p>
        <details className="rounded-xl bg-muted p-3">
          <summary className="cursor-pointer text-sm font-bold">Add sponsored ad (optional)</summary>
          <div className="mt-2 space-y-2">
            {liveAds.length ? (
              <select className="w-full rounded-md border border-input bg-background p-2 text-sm" defaultValue="" onChange={(e) => pickAd(e.target.value)}>
                <option value="" disabled>Pick a live FindMit shop advert…</option>
                {liveAds.filter((a) => a.media_type === "image").map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
            ) : null}
            <label className="block text-sm font-medium">Sponsor image<input type="file" accept="image/*" disabled={busy} className="mt-1 block w-full text-sm" onChange={(event) => void uploadSponsor(event.target.files?.[0])} /></label>
            {imagePreview ? <img src={imagePreview} alt="Sponsor preview" className="aspect-video w-full rounded-md object-cover" /> : null}
            <Input placeholder="Ad title e.g. Truck engine services" value={ad.title} onChange={set("title")} />
            <Input placeholder="Tagline e.g. Certified mechanics near Kaneshie" value={ad.tagline} onChange={set("tagline")} />
            <Input placeholder="Button text e.g. View services" value={ad.cta} onChange={set("cta")} />
            <Input placeholder="Link e.g. https://… or /@shophandle" value={ad.link} onChange={set("link")} />
            <Input placeholder="Stars (0–5)" inputMode="decimal" value={ad.rating} onChange={set("rating")} />
          </div>
        </details>
        <div className="flex gap-2 pt-1">
          <Button className="flex-1" onClick={() => void act(true)} disabled={busy || !watermarked}><Check className="mr-1 size-4" />Approve</Button>
          <Button variant="destructive" className="flex-1" onClick={() => void act(false)} disabled={busy}><X className="mr-1 size-4" />Reject</Button>
        </div>
      </div>
    </article>
  );
}
