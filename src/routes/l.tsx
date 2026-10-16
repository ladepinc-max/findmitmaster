import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MapPin, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FindMitLogo } from "@/components/FindMitLogo";
import { useAuth } from "@/lib/auth";
import { savePendingNav, type SharedPlace } from "@/lib/share-location";

export const Route = createFileRoute("/l")({
  validateSearch: (s: Record<string, unknown>) => ({
    lat: Number(s["lat"]),
    lng: Number(s["lng"]),
    label: typeof s["label"] === "string" ? (s["label"] as string) : undefined,
    landmark: typeof s["landmark"] === "string" ? (s["landmark"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Shared location — FindMit" },
      { name: "description", content: "Someone shared a place with you. Get live directions on FindMit." },
      { property: "og:title", content: "Shared location — FindMit" },
      { property: "og:description", content: "Tap to get live directions on the FindMit Ghana Community Map." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SharedLocationPage,
});

function SharedLocationPage() {
  const place = Route.useSearch() as SharedPlace;
  const { loading, session, profile } = useAuth();
  const navigate = useNavigate();
  const valid = Number.isFinite(place.lat) && Number.isFinite(place.lng);

  useEffect(() => {
    if (!valid) return;
    savePendingNav(place);
    if (!loading && session && profile) void navigate({ to: "/chat", search: { c: undefined }, replace: true });
  }, [valid, place, loading, session, profile, navigate]);

  const isAndroid = typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-background px-6 text-center">
      <FindMitLogo />
      <div className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-sm">
        <MapPin className="mx-auto size-10 text-wa-green" />
        <p className="mt-2 text-xs text-muted-foreground">Someone shared a location with you</p>
        <h1 className="mt-1 text-xl font-bold">{valid ? place.label || "Shared location" : "Link is broken"}</h1>
        {place.landmark ? <p className="mt-1 text-sm">{place.landmark}</p> : null}
        {valid ? (
          <div className="mt-5 space-y-2">
            <Button className="w-full" onClick={() => void (session ? navigate({ to: "/chat", search: { c: undefined } }) : navigate({ to: "/auth" }))}>
              <Navigation className="size-4" /> {session ? "Start live directions" : "Sign in or register to get directions"}
            </Button>
            {isAndroid ? (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  const path = `l${window.location.search}`;
                  window.location.href = `intent://findmit.world/${path}#Intent;scheme=https;package=world.findmit.app;S.browser_fallback_url=${encodeURIComponent(window.location.href)};end`;
                }}
              >
                Open in the FindMit app
              </Button>
            ) : null}
            <p className="text-xs text-muted-foreground">
              New to FindMit? Register free — we'll take you straight to the map with directions.
            </p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
