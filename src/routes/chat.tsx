import { takePendingNav } from "@/lib/share-location";
import { useCachedState } from "@/lib/page-cache";
import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { MapPin, MessageCircle, ShieldCheck } from "lucide-react";
import { CommunityMapPanel } from "@/components/chat/CommunityMapPanel";
import { LiveNavigation, type NavTarget } from "@/components/chat/LiveNavigation";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { ConversationList } from "@/components/chat/ConversationList";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { GroupChatWindow } from "@/components/chat/GroupChatWindow";
import { NewGroupDialog } from "@/components/chat/NewGroupDialog";
import { ContactInfo } from "@/components/chat/ContactInfo";
import { AmaClassCheck } from "@/components/tutor/AmaClassCheck";
import { AmaChatWindow } from "@/components/tutor/AmaChatWindow";
import { AmaAvatar } from "@/components/tutor/AmaAvatar";
import { useTutorSettings } from "@/lib/tutor";
import { fetchChatPrefs, setConversationPinned } from "@/lib/chat-prefs";
import { subscribeIncomingCalls } from "@/lib/calls";
import wallpaperSrc from "@/assets/chat-wallpaper.jpg";
const wallpaper = { url: wallpaperSrc };
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  fetchCommunities,
  fetchGroups,
  joinChat,
  type CommunitySummary,
  type GroupSummary,
} from "@/lib/groups";
import {
  fetchConversation,
  fetchConversations,
  findOrCreateConversation,
  touchLastSeen,
  type ConversationSummary,
  type ProfileLite,
} from "@/lib/chat";


export const Route = createFileRoute("/chat")({
  validateSearch: (search: Record<string, unknown>) => ({
    c: typeof search['c'] === "string" ? (search['c'] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Chat — FindMit" },
      { name: "description", content: "Message people one-to-one in real time on FindMit." },
      { property: "og:title", content: "Chat — FindMit" },
      {
        property: "og:description",
        content: "Message people one-to-one in real time on FindMit.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  return <ChatSurface />;
}

function ChatSurface() {
  const { profile } = useAuth();
  const { c: initialConversationId } = Route.useSearch();
  const [conversations, setConversations] = useCachedState<ConversationSummary[]>("chat:conversations", []);
  const [groups, setGroups] = useCachedState<GroupSummary[]>("chat:groups", []);
  const [communities, setCommunities] = useCachedState<CommunitySummary[]>("chat:communities", []);
  const [activeId, setActiveId] = useState<string | null>(initialConversationId ?? null);
  const [activeOther, setActiveOther] = useState<ProfileLite | null>(null);
  const [activeGroup, setActiveGroup] = useState<GroupSummary | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [mutedIds, setMutedIds] = useState<string[]>([]);
  const [dialogKind, setDialogKind] = useState<"group" | "community" | null>(null);
  const [amaOpen, setAmaOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [navTarget, setNavTarget] = useState<NavTarget | null>(null);
  const { settings: tutor } = useTutorSettings();
  const mapPersistReady = useRef(false);
  useEffect(() => {
    if (!mapPersistReady.current) {
      mapPersistReady.current = true;
      return;
    }
    try {
      if (mapOpen) sessionStorage.setItem("findmit:mapOpen", "1");
      else sessionStorage.removeItem("findmit:mapOpen");
    } catch {
      /* ignore */
    }
  }, [mapOpen]);

  useEffect(() => {
    const onNav = (e: Event) => {
      const d = (e as CustomEvent<NavTarget>).detail;
      if (d && Number.isFinite(d.lat) && Number.isFinite(d.lng)) setNavTarget(d);
    };
    window.addEventListener("findmit:navigate", onNav);
    const pending = takePendingNav();
    if (pending) setNavTarget(pending);
    try {
      if (sessionStorage.getItem("findmit:mapOpen") === "1") setMapOpen(true);
    } catch {
      /* ignore */
    }
    return () => window.removeEventListener("findmit:navigate", onNav);
  }, []);

  useEffect(() => {
    if (!profile) return;
    let active = true;
    void fetchChatPrefs(profile.id)
      .then((prefs) => {
        if (!active) return;
        setPinnedIds(prefs.filter((p) => p.pinned && p.conversation_id).map((p) => p.conversation_id!));
        setMutedIds(prefs.filter((p) => p.muted && p.conversation_id).map((p) => p.conversation_id!));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [profile]);

  const me: ProfileLite | null = profile
    ? {
        id: profile.id,
        username: profile.username,
        display_name: profile.display_name,
        photo_path: profile.photo_path,
        last_seen: new Date().toISOString(),
      }
    : null;

  const reload = useCallback(async () => {
    if (!profile) return;
    try {
      const [convos, groupRows, communityRows] = await Promise.all([
        fetchConversations(profile.id),
        fetchGroups(profile.id).catch(() => [] as GroupSummary[]),
        fetchCommunities(profile.id).catch(() => [] as CommunitySummary[]),
      ]);
      setConversations(convos);
      setGroups(groupRows);
      setCommunities(communityRows);
    } catch {
      /* transient */
    }
  }, [profile]);


  useEffect(() => {
    void reload();
  }, [reload]);

  // Resolve the other participant when a chat is opened via deep link.
  useEffect(() => {
    if (!profile || !activeId || activeOther || activeGroup) return;

    let active = true;
    void fetchConversation(activeId, profile.id).then((convo) => {
      if (active && convo) setActiveOther(convo.other);
    });
    return () => {
      active = false;
    };
  }, [profile, activeId, activeOther, activeGroup]);

  // Presence heartbeat.
  useEffect(() => {
    if (!profile) return;
    void touchLastSeen(profile.id);
    const id = setInterval(() => void touchLastSeen(profile.id), 30_000);
    return () => clearInterval(id);
  }, [profile]);

  // Realtime: refresh the list on any new message or conversation change.
  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel("chat-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        void reload();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        void reload();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profile, reload]);

  const openConversation = useCallback(
    async (conversationId: string) => {
      if (!profile) return;
      setAmaOpen(false);
      setActiveGroup(null);
      setActiveId(conversationId);
      const found = conversations.find((c) => c.id === conversationId);
      if (found) {
        setActiveOther(found.other);
        return;
      }
      const convo = await fetchConversation(conversationId, profile.id);
      if (convo) setActiveOther(convo.other);
    },
    [conversations, profile],
  );

  const openGroup = useCallback((group: GroupSummary) => {
    setAmaOpen(false);
    setActiveOther(null);
    setShowInfo(false);
    setActiveGroup(group);
    setActiveId(group.id);
  }, []);

  // A call arriving while browsing the chat list opens that conversation so it rings.
  useEffect(() => {
    if (!profile) return;
    return subscribeIncomingCalls(profile.id, (call) => {
      if (call.status !== "ringing") return;
      setShowInfo(false);
      void openConversation(call.conversation_id);
    });
  }, [profile, openConversation]);

  const handleJoinCommunity = useCallback(
    async (community: CommunitySummary) => {
      if (!profile || !community.announcement_chat_id) return;
      try {
        await joinChat(community.announcement_chat_id, profile.id);

        await reload();
        toast.success(`Joined ${community.name}`);
      } catch {
        toast.error("Could not join that community");
      }
    },
    [profile, reload],
  );


  const togglePin = useCallback(
    async (conversationId: string) => {
      if (!profile) return;
      const pinned = !pinnedIds.includes(conversationId);
      setPinnedIds((prev) =>
        pinned ? [...prev, conversationId] : prev.filter((id) => id !== conversationId),
      );
      await setConversationPinned(profile.id, conversationId, pinned).catch(() => undefined);
    },
    [profile, pinnedIds],
  );

  const startChat = useCallback(
    async (other: ProfileLite) => {
      if (!profile) return;
      try {
        const id = await findOrCreateConversation(profile.id, other.id);
        setActiveId(id);
        setActiveOther(other);
        await reload();
      } catch {
        toast.error("Could not start that chat");
      }
    },
    [profile, reload],
  );

  if (!me) return null;

  return (
    <AppShell wide hideNavigation={amaOpen}>
      <div
        className={`flex min-h-0 overflow-hidden bg-wa-panel ${
          amaOpen ? "h-dvh" : "h-[calc(100dvh-7rem)]"
        }`}
      >
      <aside
        className={`min-h-0 w-full shrink-0 border-r border-wa-divider md:w-[35%] ${
          activeId || amaOpen || mapOpen ? "hidden md:block" : "block"
        }`}
      >
        <div className="flex h-full min-h-0 flex-col">
        <button
          type="button"
          onClick={() => {
            setActiveGroup(null);
            setActiveOther(null);
            setShowInfo(false);
            setActiveId(null);
            setMapOpen(false);
            setAmaOpen(true);
          }}
          className={`flex w-full items-center gap-3 border-b border-wa-divider px-3 py-3 text-left ${
            amaOpen ? "bg-muted" : "bg-card"
          }`}
        >
          <AmaAvatar src={tutor.avatar_url} name={tutor.tutor_name} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1 text-sm font-semibold">
              {tutor.tutor_name}
              <ShieldCheck className="size-3.5 text-wa-green" />
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              Always active · AI tutor. Ask by voice or text.
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveGroup(null);
            setActiveOther(null);
            setShowInfo(false);
            setActiveId(null);
            setAmaOpen(false);
            setMapOpen(true);
          }}
          className={`flex w-full items-center gap-3 border-b border-wa-divider px-3 py-3 text-left ${
            mapOpen ? "bg-muted" : "bg-card"
          }`}
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-wa-green/15">
            <MapPin className="size-5 text-wa-green" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Ghana Community Map</span>
            <span className="block truncate text-xs text-muted-foreground">
              Name places, learn roads, volunteer for Ghana
            </span>
          </span>
        </button>
        <AmaClassCheck userId={me.id} />

        <div className="min-h-0 flex-1">
        <ConversationList
          meId={me.id}
          conversations={conversations}
          groups={groups}
          communities={communities}
          activeId={activeId}
          pinnedIds={pinnedIds}
          onSelect={(id) => void openConversation(id)}
          onSelectGroup={openGroup}
          onStartChat={(p) => void startChat(p)}
          onTogglePin={(id) => void togglePin(id)}
          onNewGroup={() => setDialogKind("group")}
          onNewCommunity={() => setDialogKind("community")}
          onJoinCommunity={(c) => void handleJoinCommunity(c)}
        />
        </div>
        </div>
      </aside>

      <section className={`min-h-0 min-w-0 flex-1 overflow-hidden ${activeId || amaOpen || mapOpen ? "block" : "hidden md:block"} ${showInfo ? "hidden md:block" : ""}`}>
        {navTarget ? (
          <LiveNavigation target={navTarget} onClose={() => setNavTarget(null)} />
        ) : mapOpen ? (
          <CommunityMapPanel
            userId={me.id}
            displayName={profile?.display_name || profile?.username || "Volunteer"}
            onBack={() => setMapOpen(false)}
            onNavigate={setNavTarget}
          />
        ) : amaOpen ? (
          <AmaChatWindow userId={me.id} onBack={() => setAmaOpen(false)} />
        ) : activeGroup ? (
          <GroupChatWindow
            key={activeGroup.id}
            group={activeGroup}
            me={me}
            onBack={() => {
              setActiveGroup(null);
              setActiveId(null);
              void reload();
            }}
            onChanged={() => void reload()}
          />
        ) : activeId && activeOther ? (

          <ChatWindow
            key={activeId}
            conversationId={activeId}
            me={me}
            other={activeOther}
            onBack={() => {
              setActiveId(null);
              setActiveOther(null);
              setShowInfo(false);
              void reload();
            }}
            onChanged={() => void reload()}
            onToggleInfo={() => setShowInfo((v) => !v)}
          />
        ) : (
          <div
            className="relative flex h-full flex-col items-center justify-center bg-cover bg-center px-8 text-center"
            style={{ backgroundImage: `url(${wallpaper.url})` }}
          >
            <div className="absolute inset-0 bg-black/55" />
            <div className="relative z-10 flex flex-col items-center">
              <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-white/90 shadow-sm">
                <MessageCircle className="size-7 text-wa-green" />
              </div>
              <p className="text-base font-semibold text-white">FindMit Ghana Chats</p>
              <p className="mt-1 max-w-sm text-sm text-white/80">
                Search for someone to start a one-to-one conversation. Messages are delivered in
                real time and end-to-end encrypted.
              </p>
            </div>
          </div>
        )}
      </section>

      {showInfo && activeId && activeOther ? (
        <aside className="min-h-0 w-full shrink-0 border-l border-wa-divider md:w-[22%]">
          <ContactInfo
            meId={me.id}
            conversationId={activeId}
            other={activeOther}
            muted={mutedIds.includes(activeId)}
            onMutedChange={(next) =>
              setMutedIds((prev) =>
                next ? [...prev, activeId] : prev.filter((id) => id !== activeId),
              )
            }
            onClose={() => setShowInfo(false)}
          />
        </aside>
      ) : null}

      {dialogKind ? (
        <NewGroupDialog
          meId={me.id}
          kind={dialogKind}
          open
          onOpenChange={(o) => {
            if (!o) setDialogKind(null);
          }}
          onCreated={(chatId) => {
            void (async () => {
              await reload();
              const rows = await fetchGroups(me.id).catch(() => [] as GroupSummary[]);
              const found = rows.find((g) => g.id === chatId);
              if (found) openGroup(found);
            })();
          }}

        />
      ) : null}
      </div>
      </AppShell>
  );
}
