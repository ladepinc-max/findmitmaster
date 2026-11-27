import { ProtectedRoute } from "@/components/ProtectedRoute";
import { createFileRoute } from "@tanstack/react-router";
import { AdminPartnerTvs } from "@/components/tv/AdminPartnerTvs";

export const Route = createFileRoute("/admin/partner-tvs")({
  head: () => ({
    meta: [
      { title: "Manage Partner TVs — FindMit Admin" },
      { name: "description", content: "Add, edit and remove FindMit partner TV stations." },
      { property: "og:title", content: "Manage Partner TVs — FindMit Admin" },
      {
        property: "og:description",
        content: "Add, edit and remove FindMit partner TV stations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ProtectedRoute allow={["admin"]}>
      <AdminPartnerTvs />
    </ProtectedRoute>
  ),
});

