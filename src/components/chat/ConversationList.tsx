import { FindMitLogo } from "@/components/FindMitLogo";
import { AmaLauncher } from "@/components/tutor/AmaLauncher";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  MessageCircle,
  Megaphone,
  MoreVertical,
  PhoneMissed,
  Pin,
  Search,
  SquarePen,
  Users,
  X,
} from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { CommunitySummary, GroupSummary } from "@/lib/groups";
import {
  formatListTime,
  isOnline,
  searchProfiles,
  type ConversationSummary,
  type ProfileLite,
} from "@/lib/chat";

type Filter = "all" | "unread" | "groups" | "communities";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "groups", label: "Groups" },
  { id: "communities", label: "Communities" },
];

interface Props {
  meId: string;
  conversations: ConversationSummary[];
  groups: GroupSummary[];
  communities: CommunitySummary[];
  activeId: string | null;
  pinnedIds: string[];
  onSelect: (conversationId: string) => void;
  onSelectGroup: (group: GroupSummary) => void;
  onStartChat: (profile: ProfileLite) => void;
  onTogglePin: (conversationId: string) => void;
  onNewGroup: () => void;
  onNewCommunity: () => void;
  onJoinCommunity: (community: CommunitySummary) => void;
}

export function ConversationList({
  meId,
  conversations = [],
  groups = [],
  communities = [],

  activeId,
  pinnedIds,
  onSelect,
  onSelectGroup,
  onStartChat,
  onTogglePin,
  onNewGroup,
  onNewCommunity,
  onJoinCommunity,
}: Props) {

  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [results, setResults] = useState<ProfileLite[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = term.trim();
    if (!q) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(() => {
      searchProfiles(q, meId)
        .then((rows) => setResults(rows))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [term, meId]);

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    let rows = conversations;
    if (q) {
      rows = rows.filter(
        (c) =>
          c.other.display_name.toLowerCase().includes(q) ||
          c.other.username.toLowerCase().includes(q),
      );
    }
    if (filter === "unread") rows = rows.filter((c) => c.unread > 0);
    if (filter === "groups" || filter === "communities") rows = [];
    const pinned = new Set(pinnedIds);
    return [...rows].sort((a, b) => Number(pinned.has(b.id)) - Number(pinned.has(a.id)));
  }, [conversations, term, filter, pinnedIds]);

  const visibleGroups = useMemo(() => {
    const q = term.trim().toLowerCase();
    let rows = groups;
    if (filter === "communities") rows = rows.filter((g) => g.community_id);
    else if (filter === "unread") rows = [];
    if (q) rows = rows.filter((g) => g.name.toLowerCase().includes(q));
    return rows;
  }, [groups, filter, term]);

  const discoverable = useMemo(
    () => (filter === "communities" ? communities.filter((c) => !c.joined) : []),
    [communities, filter],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-wa-panel">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 bg-wa-header px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <FindMitLogo size="sm" />
          <h2 className="truncate text-base font-semibold text-wa-text">Chats</h2>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label="New chat"
            onClick={() => searchRef.current?.focus()}
            className="flex size-9 items-center justify-center rounded-full text-wa-muted hover:bg-wa-divider"
          >
            <SquarePen className="size-5" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Menu"
                className="flex size-9 items-center justify-center rounded-full text-wa-muted hover:bg-wa-divider"
              >
                <MoreVertical className="size-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => searchRef.current?.focus()}>
                New chat
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onNewGroup}>New group</DropdownMenuItem>
              <DropdownMenuItem onSelect={onNewCommunity}>New community</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <AmaLauncher className="ml-1" />


        </div>
      </header>

      <div className="space-y-2 border-b border-wa-divider bg-wa-header px-3 pb-2.5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-wa-muted" />
          <Input
            ref={searchRef}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search or start new chat"
            className="h-9 border-0 bg-wa-panel pl-9 pr-9 text-wa-text placeholder:text-wa-muted focus-visible:ring-wa-green"
          />
          {term ? (
            <button
              type="button"
              onClick={() => setTerm("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-wa-muted"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                filter === f.id
                  ? "bg-wa-green text-white"
                  : "bg-wa-panel text-wa-muted hover:bg-wa-divider",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {results !== null ? (
          <div className="border-b border-wa-divider">
            <p className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-wa-green">
              People
            </p>
            {searching ? (
              <p className="px-4 pb-3 text-sm text-wa-muted">Searching…</p>
            ) : results.length === 0 ? (
              <p className="px-4 pb-3 text-sm text-wa-muted">No user found</p>
            ) : (
              results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setTerm("");
                    onStartChat(p);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-wa-header"
                >
                  <UserAvatar photoPath={p.photo_path} name={p.display_name} className="size-10" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-wa-text">
                      {p.display_name}
                    </span>
                    <span className="block truncate text-xs text-wa-muted">@{p.username}</span>
                  </span>
                  <span className="rounded-full bg-wa-green px-3 py-1 text-xs font-semibold text-white">
                    Start chat
                  </span>
                </button>
              ))
            )}
          </div>
        ) : null}

        {visibleGroups.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => onSelectGroup(g)}
            className={cn(
              "flex w-full items-center gap-3 border-b border-wa-divider px-3 py-3 text-left transition-colors hover:bg-wa-header",
              activeId === g.id && "bg-wa-header",
            )}
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-wa-green/15 text-wa-green">
              {g.is_community ? <Megaphone className="size-5" /> : <Users className="size-5" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[0.95rem] font-semibold text-wa-text">{g.name}</span>
                <span className="shrink-0 text-[11px] text-wa-muted">
                  {g.last_message_at ? formatListTime(g.last_message_at) : ""}
                </span>
              </span>
              <span className="mt-0.5 block truncate text-sm text-wa-muted">
                {g.last_message || `${g.members} members`}
              </span>
            </span>
          </button>
        ))}

        {discoverable.length ? (
          <div className="border-b border-wa-divider">
            <p className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-wa-green">
              Discover communities
            </p>
            {discoverable.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-wa-green/15 text-wa-green">
                  <Megaphone className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-wa-text">{c.name}</span>
                  <span className="block truncate text-xs text-wa-muted">
                    {c.groups} group{c.groups === 1 ? "" : "s"}
                    {c.description ? ` · ${c.description}` : ""}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onJoinCommunity(c)}
                  className="rounded-full bg-wa-green px-3 py-1 text-xs font-semibold text-white"
                >
                  Join
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {filtered.length === 0 &&
        visibleGroups.length === 0 &&
        discoverable.length === 0 &&
        results === null ? (
          <div className="flex flex-col items-center justify-center px-8 py-20 text-center">
            <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-wa-header">
              <MessageCircle className="size-6 text-wa-green" />
            </div>
            <p className="text-sm font-semibold text-wa-text">
              {filter === "groups"
                ? "No groups yet"
                : filter === "communities"
                  ? "No communities yet"
                  : filter === "unread"
                    ? "No unread chats"
                    : "No chats yet"}
            </p>
            <p className="mt-1 text-sm text-wa-muted">
              {filter === "groups"
                ? "Use the menu to create a group."
                : filter === "communities"
                  ? "Use the menu to create a community."
                  : "Search above to start a conversation."}
            </p>
          </div>
        ) : null}


        {filtered.map((c) => {
          const pinned = pinnedIds.includes(c.id);
          return (
            <div
              key={c.id}
              className={cn(
                "group relative border-b border-wa-divider transition-colors hover:bg-wa-header",
                activeId === c.id && "bg-wa-header",
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                className="flex w-full items-center gap-3 px-3 py-3 text-left"
              >
                <span className="relative shrink-0">
                  <UserAvatar
                    photoPath={c.other.photo_path}
                    name={c.other.display_name}
                    className="size-12"
                  />
                  {isOnline(c.other.last_seen) ? (
                    <span className="absolute bottom-0.5 right-0.5 size-3 rounded-full border-2 border-wa-panel bg-wa-green" />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1">
                      <span className="truncate text-[0.95rem] font-semibold text-wa-text">
                        {c.other.display_name}
                      </span>
                      {c.other.is_verified ? (
                        <BadgeCheck className="size-4 shrink-0 text-wa-green" />
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-[11px]",
                        c.unread > 0 ? "text-wa-green" : "text-wa-muted",
                      )}
                    >
                      {formatListTime(c.last_message_at)}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 truncate text-sm text-wa-muted">
                      {(c.last_message_text ?? "").toLowerCase().includes("missed") ? (
                        <PhoneMissed className="size-3.5 shrink-0 text-red-500" />
                      ) : null}
                      <span className="truncate">{c.last_message_text || "Say hello 👋"}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {pinned ? <Pin className="size-3.5 text-wa-muted" /> : null}
                      {c.unread > 0 ? (
                        <span className="flex min-w-5 items-center justify-center rounded-full bg-wa-green px-1.5 text-[11px] font-bold text-white">
                          {c.unread}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </span>
              </button>
              <button
                type="button"
                aria-label={pinned ? "Unpin chat" : "Pin chat"}
                onClick={() => onTogglePin(c.id)}
                className="absolute right-1 top-1 hidden size-7 items-center justify-center rounded-full text-wa-muted hover:bg-wa-divider group-hover:flex"
              >
                <Pin className={cn("size-3.5", pinned && "fill-current text-wa-green")} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
