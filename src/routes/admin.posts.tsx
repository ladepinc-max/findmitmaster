import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Menu, MonitorPlay, Radio } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DirectorPanel } from "@/components/admin/DirectorPanel";
import { useIsSuperAdmin } from "@/lib/app-sections";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/posts")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: search["tab"] === "director" ? ("director" as const) : ("posts" as const),
    room: typeof search["room"] === "string" ? search["room"] : undefined,
    mode: search["mode"] === "preview" ? ("preview" as const) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Posts & Director Panel — FindMit admin" },
      {
        name: "description",
        content: "Review FindMit posts and run a multi-camera live broadcast from the Director Panel.",
      },
      { property: "og:title", content: "Posts & Director Panel — FindMit admin" },
      {
        property: "og:description",
        content: "Review posts and switch between phone cameras for a live FindMit broadcast.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPostsPage,
});

interface PostRow {
  id: string;
  caption: string;
  media_type: string;
  status: string;
  views_count: number;
  created_at: string;
}

function AdminPostsPage() {
  const isSuperAdmin = useIsSuperAdmin();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [tab, setTab] = useState<string>(search.tab);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const roomId = search.room;

  useEffect(() => {
    setTab(search.tab);
  }, [search.tab]);

  const goLiveNow = () => {
    const room = search.room ?? Math.random().toString(36).slice(2, 8).toUpperCase();
    void navigate({ search: { tab: "director", room, mode: "preview" } });
  };

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("posts")
        .select("id, caption, media_type, status, views_count, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      setPosts((data as PostRow[] | null) ?? []);
    })();
  }, []);

  if (!isSuperAdmin) {
    return (
      <main className="grid min-h-screen place-items-center p-6 text-center">
        <p className="text-sm text-muted-foreground">This page is for the FindMit owner account.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-4 pb-28">
      <div className="flex items-center gap-2">
        <Sheet>
          <SheetTrigger asChild>
            <Button size="icon" variant="ghost" aria-label="Open admin menu">
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72">
            <SheetHeader>
              <SheetTitle className="font-display font-black">Admin</SheetTitle>
            </SheetHeader>
            <nav className="mt-4 space-y-2">
              <Link to="/admin/class-control" className="flex items-center gap-3 rounded-xl bg-primary/10 p-3 font-semibold text-primary">
                <MonitorPlay className="size-5" /> Class Control
              </Link>
            </nav>
          </SheetContent>
        </Sheet>
        <h1 className="font-display text-xl font-black">Posts</h1>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="posts">Posts</TabsTrigger>
          <TabsTrigger value="director">Director Panel</TabsTrigger>
        </TabsList>

        <TabsContent value="posts" className="space-y-3">
          <Button variant="destructive" className="w-full" onClick={goLiveNow}>
            <Radio className="size-4" /> Go Live Now
          </Button>
          {posts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No posts yet.</p>
          ) : (
            <ul className="space-y-2">
              {posts.map((post) => (
                <li key={post.id} className="rounded-xl border p-3">
                  <p className="line-clamp-2 text-sm font-semibold">{post.caption || "Untitled"}</p>
                  <p className="text-xs text-muted-foreground">
                    {post.media_type} · {post.status} · {post.views_count} views ·{" "}
                    {new Date(post.created_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="director">
          <DirectorPanel roomId={roomId} />
        </TabsContent>
      </Tabs>
    </main>
  );
}
