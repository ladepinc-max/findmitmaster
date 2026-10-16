import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, MessageCircle, Play, Briefcase, User, Home, Radio, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { useUnreadChatCount } from "@/lib/chat-notifications";
import { useNotifications } from "@/lib/useNotifications";
import { useStoriesInnerTab, type StoriesInnerTab } from "@/lib/stories-nav";
import { cn } from "@/lib/utils";
import { AmaClassEndListener } from "@/components/tutor/AmaClassEndListener";
import { hasPendingNav } from "@/lib/share-location";
import { useStoriesAccess } from "@/lib/stories-access";

const TABS = [
  { to: "/chat", label: "Chat", icon: MessageCircle },
  { to: "/", label: "Stories", icon: Play },
  { to: "/jobs", label: "Jobs", icon: Briefcase },
  { to: "/profile", label: "Profile", icon: User },
] as const;

/** Ensures the app opens on Jobs (FindMit Ghana) instead of Stories on first launch. */
let initialRedirectDone = false;

const STORIES_TABS: { id: StoriesInnerTab; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "live", label: "Live", icon: Radio },
  { id: "post", label: "Post", icon: Plus },
];

function BottomNavFrame({ children }: { children: ReactNode }) {
  return (
    <nav aria-label="App navigation" className="fixed inset-x-2 bottom-2 z-40 mx-auto max-w-xl">
      <div className="flex h-[4.5rem] items-center gap-1 rounded-[2rem] border border-nav-border bg-nav-surface px-2 shadow-nav-bar">
        {children}
      </div>
    </nav>
  );
}

function StoriesBottomNav() {
  const [tab, setTab] = useStoriesInnerTab();
  return (
    <BottomNavFrame>
      <ul className="flex min-w-0 flex-1 items-stretch">
        {STORIES_TABS.map(({ id, label, icon: Icon }) => (
          <li key={id} className="flex-1">
            <button
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "flex h-full w-full flex-col items-center justify-center gap-1 py-2 text-[0.68rem] font-semibold transition-colors",
                tab === id ? "text-nav-active" : "text-nav-muted hover:text-nav-foreground",
              )}
            >
              <Icon className="size-5" strokeWidth={tab === id ? 2.4 : 1.8} />
              {label}
            </button>
          </li>
        ))}
      </ul>
    </BottomNavFrame>
  );
}

function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { profile } = useAuth();
  const { count: unreadChats } = useUnreadChatCount(profile?.id);
  const { allowed: storiesAllowed } = useStoriesAccess();

  useNotifications(profile?.id);

  return (
    <BottomNavFrame>
      <ul className="flex min-w-0 flex-1 items-stretch">
        {TABS.filter((t) => t.to !== "/" || storiesAllowed).map(({ to, label, icon: Icon }) => {
          const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
          return (
            <li key={to} className="flex-1">
              <Link
                to={to}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-1 py-2 text-[0.68rem] font-semibold transition-colors",
                  active ? "text-nav-active" : "text-nav-muted hover:text-nav-foreground",
                )}
              >
                <span className="relative">
                  <Icon className="size-5" strokeWidth={active ? 2.4 : 1.8} />
                  {to === "/chat" && unreadChats > 0 ? (
                    <Badge className="absolute -right-2.5 -top-1.5 h-4 min-w-4 justify-center rounded-full border-0 bg-wa-green px-1 text-[10px] font-bold leading-none text-white hover:bg-wa-green">
                      {unreadChats > 99 ? "99+" : unreadChats}
                    </Badge>
                  ) : null}
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </BottomNavFrame>
  );
}

/** Skeleton splash shown while the session/profile resolves — avoids a blank white screen. */
function AppSkeleton() {
  return (
    <div className="min-h-screen animate-pulse bg-background px-4 pb-20 pt-6">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-full bg-secondary" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 rounded bg-secondary" />
            <div className="h-3 w-1/2 rounded bg-secondary/70" />
          </div>
        </div>
        <div className="h-48 rounded-2xl bg-secondary" />
        <div className="h-48 rounded-2xl bg-secondary/70" />
        <div className="h-24 rounded-2xl bg-secondary/50" />
      </div>
    </div>
  );
}


/** Gates a screen behind sign-in + a completed profile, then renders it with the tab bar. */
export function AppShell({
  children,
  wide = false,
  hideNavigation = false,
}: {
  children: ReactNode;
  wide?: boolean;
  hideNavigation?: boolean;
}) {
  const { loading, session, profile } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const stories = useStoriesAccess();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      void navigate({ to: "/auth", replace: true });
    } else if (!profile) {
      void navigate({ to: "/onboarding", replace: true });
    } else if (pathname !== "/chat" && hasPendingNav()) {
      // A shared location link was opened before sign-in: go straight to directions.
      initialRedirectDone = true;
      void navigate({ to: "/chat", search: { c: undefined }, replace: true });
    }
  }, [loading, session, profile, navigate, pathname]);

  // First launch lands on Jobs (FindMit Ghana) instead of Stories.
  useEffect(() => {
    if (loading) return;
    if (initialRedirectDone) return;
    initialRedirectDone = true;
    if (pathname === "/") {
      void navigate({ to: "/jobs", search: { tab: "jobs" }, replace: true });
    }
  }, [loading, pathname, navigate]);

  // Stories is private until admin publishes it: unapproved users go to Jobs.
  useEffect(() => {
    if (pathname === "/" && !stories.loading && !stories.allowed) {
      void navigate({ to: "/jobs", search: { tab: "jobs" }, replace: true });
    }
  }, [pathname, stories.loading, stories.allowed, navigate]);

  if (loading || !session || !profile) return <AppSkeleton />;
  if (pathname === "/" && (stories.loading || !stories.allowed)) return <AppSkeleton />;

  const isStories = pathname === "/";

  return (
    <div className={`min-h-screen bg-background ${hideNavigation ? "" : "pb-28"}`}>
      <AmaClassEndListener userId={profile.id} />
      <div className={cn("mx-auto", wide ? "max-w-6xl" : "max-w-lg")}>{children}</div>
      {hideNavigation ? null : isStories ? <StoriesBottomNav /> : <BottomNav />}
    </div>
  );
}

export function ScreenHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
      <h1 className="font-display text-xl font-bold">{title}</h1>
      {action}
    </header>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-24 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-secondary">
        <Icon className="size-6 text-muted-foreground" />
      </div>
      <h2 className="font-display text-base font-semibold">{title}</h2>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
