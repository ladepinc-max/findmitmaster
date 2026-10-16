import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Award, Loader2, Lock, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { fetchReplays, useClassMediaUrl, type ClassReplay } from "@/lib/classroom";

export const Route = createFileRoute("/education/$slug/replays")({
  head: () => ({
    meta: [
      { title: "Class replays — FindMit Education" },
      {
        name: "description",
        content:
          "Watch replays of live hands-on FindMit classes. Paid students get the full class and a certificate; everyone else gets a 2 minute preview.",
      },
      { property: "og:title", content: "Class replays — FindMit Education" },
      {
        property: "og:description",
        content: "Full class replays and certificates for paid students, 2 minute previews for everyone.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReplaysPage,
});

function ReplaysPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [replays, setReplays] = useState<ClassReplay[]>([]);
  const [paidClasses, setPaidClasses] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const rows = await fetchReplays(slug);
      setReplays(rows);
      if (user) {
        const { data } = await supabase
          .from("class_enrollments")
          .select("class_id")
          .eq("user_id", user.id);
        setPaidClasses(new Set(((data as { class_id: string }[] | null) ?? []).map((r) => r.class_id)));
      }
      setLoading(false);
    })();
  }, [slug, user]);

  return (
    <div className="min-h-dvh bg-[#121212] px-4 pb-24 pt-6 text-white">
      <div className="mx-auto max-w-3xl">
        <Button variant="ghost" size="sm" onClick={() => void navigate({ to: "/" })}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        <h1 className="mt-3 text-2xl font-bold capitalize">{slug.replace(/-/g, " ")} replays</h1>
        <p className="text-sm text-white/60">
          Paid students watch the full class and get a certificate. Everyone else gets a 2 minute
          preview.
        </p>

        {loading ? (
          <div className="grid py-20 place-items-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : replays.length === 0 ? (
          <p className="py-20 text-center text-sm text-white/50">No replays yet</p>
        ) : (
          <div className="mt-6 space-y-4">
            {replays.map((replay) => (
              <ReplayCard key={replay.id} replay={replay} unlocked={paidClasses.has(replay.class_id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReplayCard({ replay, unlocked }: { replay: ClassReplay; unlocked: boolean }) {
  const url = useClassMediaUrl(replay.video_path);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#1E1E1E]">
      <div className="relative aspect-video bg-black">
        {url ? (
          <video
            ref={(node) => {
              if (!node || unlocked) return;
              node.ontimeupdate = () => {
                if (node.currentTime > replay.preview_seconds) {
                  node.pause();
                  node.currentTime = 0;
                }
              };
            }}
            src={url}
            controls
            playsInline
            preload="metadata"
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="grid h-full place-items-center text-white/50">
            <PlayCircle className="h-8 w-8" />
          </div>
        )}
        {!unlocked ? (
          <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[11px]">
            <Lock className="h-3 w-3" /> 2 min preview
          </span>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-3 p-3">
        <div>
          <p className="font-semibold">{replay.title}</p>
          <p className="text-xs text-white/60">
            {unlocked ? "Full class unlocked" : `Unlock full class · GHS ${replay.price}`}
          </p>
        </div>
        {unlocked ? (
          <span className="flex items-center gap-1 rounded-full bg-[#25D366]/20 px-2 py-1 text-[11px] text-[#25D366]">
            <Award className="h-3 w-3" /> Certificate ready
          </span>
        ) : null}
      </div>
    </div>
  );
}
