import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";
import { AmaSpeechBar } from "@/components/tutor/AmaSpeechBar";
import { DebugPanel } from "@/components/DebugPanel";
import { PullToRefresh } from "@/components/PullToRefresh";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/jobs"
            search={{ tab: "ghana" }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    // An outdated page file after an app update: reload once to fetch the new one.
    const msg = error instanceof Error ? error.message : String(error);
    if (/dynamically imported module|Importing a module script failed|error loading dynamically/i.test(msg)) {
      const key = "fm-chunk-reload";
      const last = Number(sessionStorage.getItem(key) || 0);
      if (Date.now() - last > 10000) {
        sessionStorage.setItem(key, String(Date.now()));
        window.location.reload();
        return;
      }
    }
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "FindMit — From classrooms to careers across Ghana" },
      {
        name: "description",
        content:
          "FindMit is a Ghanaian app for short-form stories, real-time chat, live classes and jobs.",
      },
      { name: "theme-color", content: "#141518" },
      { property: "og:site_name", content: "FindMit" },
      { property: "og:type", content: "website" },

      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:opsz,wght@14..32,400;14..32,500;14..32,600;14..32,700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&display=swap",
      },

      { rel: "icon", href: "/favicon.png", type: "image/png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    // Published app only: register the worker early so build files are cached on the phone.
    const h = window.location.hostname;
    const preview = !import.meta.env.PROD || window.self !== window.top ||
      /^(id-preview--|preview--)/.test(h) || /lovableproject(-dev)?\.com$/.test(h);
    if (preview || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  useEffect(() => {
    // After a new publish, old page files disappear: reload once to get the new version.
    const isChunkError = (m: string) =>
      /dynamically imported module|Importing a module script failed|error loading dynamically/i.test(m);
    const reloadOnce = () => {
      const key = "fm-chunk-reload";
      if (Date.now() - Number(sessionStorage.getItem(key) || 0) < 10000) return;
      sessionStorage.setItem(key, String(Date.now()));
      window.location.reload();
    };
    const onPreload = (e: Event) => {
      e.preventDefault();
      reloadOnce();
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason as { message?: string } | undefined;
      if (isChunkError(String(r?.message ?? r ?? ""))) reloadOnce();
    };
    window.addEventListener("vite:preloadError", onPreload);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("vite:preloadError", onPreload);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);


  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        <AmaSpeechBar />
        <Toaster position="top-center" />
        <DebugPanel />
        <PullToRefresh />
      </AuthProvider>
    </QueryClientProvider>
  );
}
