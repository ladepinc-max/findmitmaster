import { createFileRoute } from "@tanstack/react-router";
import { StationsPage } from "@/components/tv/StationsPage";

export const Route = createFileRoute("/stations")({
  head: () => ({
    meta: [
      { title: "Partner TV Stations — FindMit" },
      {
        name: "description",
        content: "Watch Ghanaian partner TV stations streaming live on FindMit.",
      },
      { property: "og:title", content: "Partner TV Stations — FindMit" },
      {
        property: "og:description",
        content: "Watch Ghanaian partner TV stations streaming live on FindMit.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StationsPage,
});

