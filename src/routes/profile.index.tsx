import { useCachedState } from "@/lib/page-cache";
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BadgeCheck, Bell, Copy, FolderPlus, MapPin, Search, Settings } from "lucide-react";
import { PricingSection } from "@/components/settings/PricingSection";
import { copyFindmitId, findmitId } from "@/lib/user-id";
import { toast } from "sonner";
import { AppShell, EmptyState } from "@/components/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EmptyFolder,
  FolderCard,
  FolderDialog,
  FolderView,
  MediaCard,
  MoveToFolderDrawer,
  type MediaItem,
} from "@/components/profile/FolderSystem";
import { useAuth } from "@/lib/auth";
import { LiveReplaysSection } from "@/components/profile/LiveReplaysSection";
import { AmaLauncher } from "@/components/tutor/AmaLauncher";
import { FreeAccessManager } from "@/components/admin/FreeAccessManager";
import { SectionWaivers } from "@/components/admin/SectionWaivers";
import { FindMitApplications } from "@/components/admin/FindMitApplications";
import { WalletFund, WalletPackagesAdmin } from "@/components/profile/WalletSection";
import { useRole } from "@/lib/roles";
import {
  addItemToFolder,
  createFolder,
  deleteFolder,
  fetchFolderItems,
  fetchFolders,
  fetchMyReplays,
  removeItemFromFolder,
  updateFolder,
  viewedPostIds,
  watchedPercent,
  type FolderItem,
  type ProfileFolder,
} from "@/lib/folders";
import {
  fetchPostsByIds,
  fetchSavedPosts,
  fetchUserPosts,
  type Post,
} from "@/lib/social";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { TV_LABELS, TV_ORDER } from "@/lib/tv-live";
import { useTvChoice } from "@/lib/tv-choice";


export const Route = createFileRoute("/profile/")({
  head: () => ({
    meta: [
      { title: "Your profile & folders — FindMit" },
      {
        name: "description",
        content:
          "Organise your FindMit Ghana videos, pictures and live class replays into colour-coded subject folders.",
      },
      { property: "og:title", content: "Your profile & folders — FindMit" },
      {
        property: "og:description",
        content:
          "Organise your FindMit Ghana videos, pictures and live class replays into colour-coded subject folders.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProfilePage,
});

type MediaTab = "posted" | "viewed" | "saved" | "replays";
type SortKey = "recent" | "name" | "subject";

function postToItem(post: Post): MediaItem {
  return {
    id: post.id,
    type: post.media_type === "video" ? "video" : "image",
    title: post.caption || (post.media_type === "video" ? "Video" : "Picture"),
    subject: post.hashtags?.[0] ?? null,
    duration: post.duration_seconds,
    createdAt: post.created_at,
    thumbPath: post.media_type === "image" ? post.media_path : (post.thumbnail_path ?? null),
  };
}

function ProfilePage() {
  const { profile } = useAuth();
  const { isAdmin } = useRole();
  const [tab, setTab] = useState<MediaTab>("posted");
  const [sort, setSort] = useState<SortKey>("recent");
  const [term, setTerm] = useState("");

  const [posted, setPosted] = useCachedState<MediaItem[]>("profile:posted", []);
  const [saved, setSaved] = useCachedState<MediaItem[]>("profile:saved", []);
  const [viewed, setViewed] = useCachedState<MediaItem[]>("profile:viewed", []);
  const [replays, setReplays] = useCachedState<MediaItem[]>("profile:replays", []);
  const [loaded, setLoaded] = useState(false);

  const [folders, setFolders] = useCachedState<ProfileFolder[]>("profile:folders", []);
  const [folderItems, setFolderItems] = useCachedState<FolderItem[]>("profile:folderItems", []);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProfileFolder | null>(null);
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [hoverFolder, setHoverFolder] = useState<string | null>(null);
  const [drawerItem, setDrawerItem] = useState<MediaItem | null>(null);

  useEffect(() => {
    if (!profile) return;
    let active = true;
    setLoaded(false);
    void Promise.all([
      fetchUserPosts(profile.id),
      fetchSavedPosts(profile.id),
      fetchPostsByIds(viewedPostIds()),
      fetchMyReplays(profile.id),
      fetchFolders(profile.id),
      fetchFolderItems(profile.id),
    ])
      .then(([mine, savedRows, viewedRows, replayRows, folderRows, itemRows]) => {
        if (!active) return;
        setPosted(mine.map(postToItem));
        setSaved(savedRows.map(postToItem));
        setViewed(viewedRows.map(postToItem));
        setReplays(
          replayRows.map((view) => ({
            id: view.session?.id ?? view.live_session_id,
            type: "live_replay" as const,
            title: `${view.session?.topic ?? "Live class"} — ${view.session?.host?.display_name ?? "Teacher"}`,
            subject: view.session?.subject ?? null,
            duration: view.session?.duration_seconds ?? null,
            createdAt: view.watched_at,
            thumbPath: null,
            progress: watchedPercent(view),
          })),
        );
        setFolders(folderRows);
        setFolderItems(itemRows);
        setLoaded(true);
      })
      .catch(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [profile]);

  const allItems = useMemo(
    () => [...posted, ...saved, ...viewed, ...replays],
    [posted, saved, viewed, replays],
  );

  const tabItems = useMemo(() => {
    const source =
      tab === "posted" ? posted : tab === "saved" ? saved : tab === "viewed" ? viewed : replays;
    const query = term.trim().toLowerCase();
    const filtered = query
      ? source.filter((item) =>
          `${item.title} ${item.subject ?? ""}`.toLowerCase().includes(query),
        )
      : source;
    const sorted = [...filtered];
    if (sort === "name") sorted.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === "subject")
      sorted.sort((a, b) => (a.subject ?? "zz").localeCompare(b.subject ?? "zz"));
    else sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return sorted;
  }, [tab, posted, saved, viewed, replays, term, sort]);

  const visibleFolders = useMemo(() => {
    const query = term.trim().toLowerCase();
    const list = query
      ? folders.filter((folder) => folder.name.toLowerCase().includes(query))
      : folders;
    const sorted = [...list];
    if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else sorted.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return sorted;
  }, [folders, term, sort]);

  if (!profile) return null;

  const countFor = (folderId: string) =>
    folderItems.filter((row) => row.folder_id === folderId).length;

  const addToFolder = async (folderId: string, item: MediaItem) => {
    try {
      await addItemToFolder({
        folderId,
        userId: profile.id,
        itemType: item.type,
        itemId: item.id,
        title: item.title,
      });
      const [folderRows, itemRows] = await Promise.all([
        fetchFolders(profile.id),
        fetchFolderItems(profile.id),
      ]);
      setFolders(folderRows);
      setFolderItems(itemRows);
      const name = folderRows.find((row) => row.id === folderId)?.name ?? "folder";
      toast.success(`Moved to ${name}`);
    } catch {
      toast.error("Could not move that item");
    }
  };

  const openFolder = folders.find((folder) => folder.id === openFolderId) ?? null;
  const openFolderContents = openFolder
    ? folderItems
        .filter((row) => row.folder_id === openFolder.id)
        .map((row) => {
          const match = allItems.find(
            (item) => item.id === row.item_id && item.type === row.item_type,
          );
          return (
            match ?? {
              id: row.item_id,
              type: row.item_type,
              title: row.title ?? "Item",
              subject: null,
              duration: null,
              createdAt: row.added_at,
              thumbPath: null,
            }
          );
        })
    : [];

  const stats = [
    { label: "Posts", value: profile.posts_count },
    { label: "Followers", value: profile.followers_count },
    { label: "Following", value: profile.following_count },
  ];

  return (
    <AppShell>
      <header className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-1.5">
          <h1 className="font-display text-lg font-bold">@{profile.username}</h1>
          {profile.is_verified ? <BadgeCheck className="size-4 text-accent" /> : null}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Create new folder"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
            className="relative text-primary"
          >
            <FolderPlus className="size-5" />
            {folders.length > 0 ? (
              <span className="absolute -right-2 -top-2 rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                {folders.length}
              </span>
            ) : null}
          </button>
          <Link to="/settings" aria-label="Settings" className="text-muted-foreground hover:text-foreground">
            <Settings className="size-5" />
          </Link>
        </div>
      </header>

      <section className="px-4">
        <div className="flex items-center gap-4">
          <UserAvatar photoPath={profile.photo_path} name={profile.display_name} className="size-[90px]" />
          <AmaLauncher label="AI Tutor" />
          <div className="flex flex-1 justify-around">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="font-display text-base font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-4 font-display text-sm font-bold">{profile.display_name}</p>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="size-3" /> Ghana
        </p>
        {profile.bio ? (
          <p className="mt-1 whitespace-pre-line text-sm text-foreground/90">
            <BioText text={profile.bio} />
          </p>
        ) : null}
        {profile.website ? (
          <a
            href={profile.website}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-1 inline-block text-sm text-accent hover:underline"
          >
            {profile.website.replace(/^https?:\/\//, "")}
          </a>
        ) : null}

        <div className="mt-4 flex gap-2">
          <Button asChild variant="secondary" className="flex-1">
            <Link to="/profile/edit">Edit Profile</Link>
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => {
              void navigator.clipboard?.writeText(`${window.location.origin}/u/${profile.username}`);
            }}
          >
            Share Profile
          </Button>
        </div>

        <Button asChild variant="secondary" className="mt-2 w-full">
          <Link to="/assign-sounds">
            <Bell className="size-4" /> Assign Sounds
          </Link>
        </Button>

        <button
          type="button"
          onClick={() => void copyFindmitId(findmitId(profile.id))}
          className="mt-3 flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left"
        >
          <span>
            <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">
              Your FindMit ID
            </span>
            <span className="block font-mono text-sm font-bold">{findmitId(profile.id)}</span>
          </span>
          <Copy className="size-4 text-muted-foreground" />
        </button>

        <Link
          to="/tutor"
          className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3"
        >
          <span>
            <span className="block text-sm font-semibold">Ama — WASSCE Tutor</span>
            <span className="block text-xs text-muted-foreground">
              Past questions, instant marking and explanations
            </span>
          </span>
          <span className="text-xs font-semibold text-primary">Open</span>
        </Link>

        <ChooseChannel />

        <div className="-mx-4 mt-2">
          <PricingSection />
        </div>
      </section>


      {openFolder ? (
        <FolderView
          folder={openFolder}
          items={openFolderContents}
          onBack={() => setOpenFolderId(null)}
          onRemove={async (item) => {
            const row = folderItems.find(
              (entry) =>
                entry.folder_id === openFolder.id &&
                entry.item_id === item.id &&
                entry.item_type === item.type,
            );
            if (!row) return;
            await removeItemFromFolder(row.id);
            setFolderItems((prev) => prev.filter((entry) => entry.id !== row.id));
          }}
        />
      ) : (
        <>
          <section className="mt-6 px-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                  placeholder="Search folders and videos"
                  className="pl-9"
                />
              </div>
              <Select value={sort} onValueChange={(value) => setSort(value as SortKey)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Recent</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="subject">Subject</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <h2 className="mt-5 font-display text-sm font-bold">Folders</h2>
            {visibleFolders.length === 0 ? (
              <div className="mt-2">
                <EmptyFolder />
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {visibleFolders.map((folder) => (
                  <FolderCard
                    key={folder.id}
                    folder={folder}
                    count={countFor(folder.id)}
                    active={hoverFolder === folder.id}
                    onOpen={() => setOpenFolderId(folder.id)}
                    onRename={() => {
                      setEditing(folder);
                      setDialogOpen(true);
                    }}
                    onDelete={async () => {
                      await deleteFolder(folder.id);
                      setFolders((prev) => prev.filter((row) => row.id !== folder.id));
                      setFolderItems((prev) => prev.filter((row) => row.folder_id !== folder.id));
                    }}
                  />
                ))}
              </div>
            )}
          </section>

          <nav className="mt-6 flex border-y border-border text-xs">
            {(
              [
                { id: "posted", label: "Posted" },
                { id: "viewed", label: "Viewed" },
                { id: "saved", label: "Saved" },
                { id: "replays", label: "Live Replays" },
              ] as const
            ).map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "flex-1 py-3 font-medium transition-colors",
                  tab === id
                    ? "border-b-2 border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </nav>

          <section className="p-4">
            {tab === "replays" ? (
              <LiveReplaysSection userId={profile.id} isMe />
            ) : tabItems.length === 0 ? (
              loaded ? (
                <EmptyState
                  icon={Search}
                  title="Nothing here yet"
                  description="Videos, pictures and live class replays you collect will show up here."
                />
              ) : (
                <div className="flex justify-center py-16">
                  <div className="size-8 animate-spin rounded-full border-2 border-border border-t-primary" />
                </div>
              )
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {tabItems.map((item) => (
                  <MediaCard
                    key={`${item.type}-${item.id}`}
                    item={item}
                    folders={folders}
                    onHoverFolder={setHoverFolder}
                    onDropOnFolder={(folderId, dropped) => void addToFolder(folderId, dropped)}
                    onAddToFolder={setDrawerItem}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <div className="px-4"><WalletFund /></div>
      {isAdmin ? <div className="px-4"><WalletPackagesAdmin /><SectionWaivers /><FreeAccessManager /><FindMitApplications /></div> : null}

      <FolderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        folder={editing}
        onSubmit={async (name, color) => {
          if (editing) {
            await updateFolder(editing.id, { name, color });
            setFolders((prev) =>
              prev.map((row) => (row.id === editing.id ? { ...row, name, color } : row)),
            );
          } else {
            const created = await createFolder(profile.id, name, color);
            setFolders((prev) => [created, ...prev]);
          }
        }}
      />

      <MoveToFolderDrawer
        item={drawerItem}
        folders={folders}
        onClose={() => setDrawerItem(null)}
        onPick={(folderId) => {
          if (drawerItem) void addToFolder(folderId, drawerItem);
          setDrawerItem(null);
        }}
      />
    </AppShell>
  );
}

function BioText({ text }: { text: string }) {
  const parts = text.split(/(@[a-z0-9._]+|#[\w]+)/gi);
  return (
    <>
      {parts.map((part, index) =>
        /^[@#]/.test(part) ? (
          <span key={index} className="text-accent">
            {part}
          </span>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

/** Pick one class TV channel — it becomes the Home screen for this viewer. */
function ChooseChannel() {
  const [choice, setChoice] = useTvChoice();
  return (
    <div className="mt-6 rounded-2xl border border-border bg-card p-4 text-left">
      <h2 className="font-display text-sm font-bold">Choose Channel</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Turn on one channel. Its lessons play full screen on your Home tab with sound.
      </p>
      <ul className="mt-3 space-y-2">
        {TV_ORDER.map((category) => (
          <li key={category} className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold">{TV_LABELS[category]}</span>
            <Switch
              checked={choice === category}
              onCheckedChange={(on) => setChoice(on ? category : null)}
              aria-label={TV_LABELS[category]}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
