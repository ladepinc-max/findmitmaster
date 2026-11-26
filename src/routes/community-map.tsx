import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { CommunityMapPanel } from "@/components/chat/CommunityMapPanel";
import { LiveNavigation, type NavTarget } from "@/components/chat/LiveNavigation";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/community-map")({
  head: () => ({
    meta: [
      { title: "Community Map — FindMit Ghana" },
      { name: "description", content: "Explore Ghana's community map, find shops, name places and learn roads on FindMit." },
      { property: "og:title", content: "Community Map — FindMit Ghana" },
      { property: "og:description", content: "Find local shops and explore roads and places mapped by the FindMit community." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CommunityMapPage,
});

function CommunityMapPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [target, setTarget] = useState<NavTarget | null>(null);
  return (
    <AppShell wide hideNavigation>
      <div className="h-dvh min-h-0">
        {target ? (
          <LiveNavigation target={target} onClose={() => setTarget(null)} />
        ) : profile ? (
          <CommunityMapPanel
            userId={profile.id}
            displayName={profile.display_name || profile.username || "Volunteer"}
            onBack={() => void navigate({ to: "/home" })}
            onNavigate={setTarget}
          />
        ) : null}
      </div>
    </AppShell>
  );
}