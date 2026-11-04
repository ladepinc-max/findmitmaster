import { useState } from "react";
import { Globe, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { normalizeUrl, useHomeFeed, useQuickApps } from "@/lib/home-browser";

/** Admin only: manage Home Quick Access apps and the scrollable news/ads feed. */
export function HomeBrowserAdmin() {
  const { apps, reload: reloadApps } = useQuickApps();
  const { items, reload: reloadFeed } = useHomeFeed();
  const [app, setApp] = useState({ label: "", url: "", color: "#16a34a", icon_text: "" });
  const [post, setPost] = useState({ kind: "news", title: "", body: "", image_url: "", link_url: "" });
  const [busy, setBusy] = useState(false);

  const addApp = async () => {
    setBusy(true);
    const { error } = await supabase.from("home_quick_apps").insert({
      label: app.label.trim(),
      url: normalizeUrl(app.url),
      color: app.color,
      icon_text: app.icon_text.trim().slice(0, 2),
      sort_order: apps.length + 1,
    });
    setBusy(false);
    if (error) return void toast.error("Could not add app");
    setApp({ label: "", url: "", color: "#16a34a", icon_text: "" });
    toast.success("Quick Access app added");
    void reloadApps();
  };

  const removeApp = async (id: string) => {
    if (!confirm("Remove this app from Quick Access?")) return;
    await supabase.from("home_quick_apps").delete().eq("id", id);
    void reloadApps();
  };

  const addPost = async () => {
    setBusy(true);
    const { error } = await supabase.from("home_feed_items").insert({
      kind: post.kind,
      title: post.title.trim(),
      body: post.body.trim(),
      image_url: post.image_url.trim() || null,
      link_url: post.link_url.trim() || null,
    });
    setBusy(false);
    if (error) return void toast.error("Could not publish");
    setPost({ kind: "news", title: "", body: "", image_url: "", link_url: "" });
    toast.success("Published to Home");
    void reloadFeed();
  };

  const toggle = async (id: string, is_active: boolean) => {
    await supabase.from("home_feed_items").update({ is_active }).eq("id", id);
    void reloadFeed();
  };

  const removePost = async (id: string) => {
    if (!confirm("Delete this post?")) return;
    await supabase.from("home_feed_items").delete().eq("id", id);
    void reloadFeed();
  };

  return (
    <section className="px-6 pb-6">
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Globe className="size-3.5" /> Home browser (admin)
      </h2>

      <KnowledgeCrawlerPanel />

      <div className="mt-3 space-y-3 rounded-xl border border-border bg-surface px-4 py-3">
        <p className="text-sm font-semibold">Quick Access apps</p>
        <ul className="space-y-1">
          {apps.map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-sm">
              <span className="flex size-6 items-center justify-center rounded-full text-xs font-bold text-primary-foreground" style={{ backgroundColor: a.color }}>
                {a.icon_text || a.label.charAt(0)}
              </span>
              <span className="flex-1 truncate">{a.label}</span>
              <button aria-label={`Remove ${a.label}`} onClick={() => void removeApp(a.id)} className="text-destructive">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
        <Input placeholder="Name (e.g. MyJoyOnline)" value={app.label} onChange={(e) => setApp({ ...app, label: e.target.value })} />
        <Input placeholder="Website (e.g. myjoyonline.com)" value={app.url} onChange={(e) => setApp({ ...app, url: e.target.value })} />
        <div className="flex gap-2">
          <Input placeholder="Icon letter" value={app.icon_text} onChange={(e) => setApp({ ...app, icon_text: e.target.value })} />
          <input type="color" aria-label="Icon colour" value={app.color} onChange={(e) => setApp({ ...app, color: e.target.value })} className="h-10 w-14 rounded" />
        </div>
        <Button className="w-full" disabled={busy || !app.label.trim() || !app.url.trim()} onClick={() => void addApp()}>
          Add app
        </Button>
      </div>

      <div className="mt-4 space-y-3 rounded-xl border border-border bg-surface px-4 py-3">
        <p className="text-sm font-semibold">News & ads feed</p>
        <div className="flex gap-2">
          {(["news", "ad"] as const).map((k) => (
            <Button key={k} size="sm" variant={post.kind === k ? "default" : "outline"} onClick={() => setPost({ ...post, kind: k })}>
              {k === "ad" ? "Ad" : "News"}
            </Button>
          ))}
        </div>
        <Input placeholder="Headline" value={post.title} onChange={(e) => setPost({ ...post, title: e.target.value })} />
        <Input placeholder="Short text (optional)" value={post.body} onChange={(e) => setPost({ ...post, body: e.target.value })} />
        <Input placeholder="Image link (optional)" value={post.image_url} onChange={(e) => setPost({ ...post, image_url: e.target.value })} />
        <Input placeholder="Opens website (optional)" value={post.link_url} onChange={(e) => setPost({ ...post, link_url: e.target.value })} />
        <Button className="w-full" disabled={busy || !post.title.trim()} onClick={() => void addPost()}>
          Publish to Home
        </Button>
        <ul className="space-y-2">
          {items.map((f) => (
            <li key={f.id} className="flex items-center gap-2 text-sm">
              <span className="text-[0.65rem] font-bold uppercase text-muted-foreground">{f.kind}</span>
              <span className="flex-1 truncate">{f.title}</span>
              <Switch checked={f.is_active} onCheckedChange={(v) => void toggle(f.id, v)} aria-label="Show on Home" />
              <button aria-label="Delete" onClick={() => void removePost(f.id)} className="text-destructive">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
