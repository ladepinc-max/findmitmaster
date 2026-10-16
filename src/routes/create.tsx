import { createFileRoute } from "@tanstack/react-router";
import { Sparkle, Scissors, Wand2 } from "lucide-react";
import { AppShell, ScreenHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/create")({
  head: () => ({
    meta: [
      { title: "Create — FindMit" },
      {
        name: "description",
        content: "Edit videos and generate images and clips with AI tools inside FindMit.",
      },
      { property: "og:title", content: "Create — FindMit" },
      {
        property: "og:description",
        content: "Edit videos and generate images and clips with AI tools inside FindMit.",
      },
    ],
  }),
  component: CreatePage,
});

const TOOLS = [
  {
    icon: Scissors,
    title: "AI Video Editor",
    description: "Trim, cut, speed, captions, templates and 4K export.",
  },
  {
    icon: Wand2,
    title: "AI Generator",
    description: "Turn a prompt into an image or a short video.",
  },
  {
    icon: Sparkle,
    title: "Voice & Captions",
    description: "Text to speech, voiceovers and auto captions.",
  },
];

function CreatePage() {
  return (
    <AppShell>
      <ScreenHeader title="Create" />
      <div className="space-y-3 px-4 py-5">
        <p className="text-sm text-muted-foreground">
          Studio tools arrive in an upcoming build step. Here's what's coming.
        </p>
        {TOOLS.map(({ icon: Icon, title, description }) => (
          <Card key={title} className="flex items-start gap-3 border-border bg-card p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
              <Icon className="size-5 text-accent" />
            </span>
            <div>
              <h2 className="font-display text-sm font-semibold">{title}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
            </div>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
