import { ProtectedRoute } from "@/components/ProtectedRoute";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { PartnerTv } from "./stations";

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

const EMPTY = {
  name: "",
  logo_url: "",
  live_stream_url: "",
  category: "General",
  region: "",
  description: "",
  is_active: true,
};

/** Partner-TV manager reused by /admin/partner-tvs and the Stories "Manage TV" tab. */
export function AdminPartnerTvs() {
  const [form, setForm] = useState({ ...EMPTY });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rows, setRows] = useState<PartnerTv[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("partner_tvs")
      .select("*")
      .order("created_at", { ascending: false });
    setRows((data ?? []) as PartnerTv[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!form.name.trim() || !form.live_stream_url.trim()) {
      toast.error("Name and live stream link are required");
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      logo_url: form.logo_url.trim() || null,
      live_stream_url: form.live_stream_url.trim(),
      category: form.category.trim() || "General",
      region: form.region.trim() || null,
      description: form.description.trim() || null,
      is_active: form.is_active,
    };
    const { error } = editingId
      ? await supabase.from("partner_tvs").update(payload).eq("id", editingId)
      : await supabase.from("partner_tvs").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editingId ? "Station updated" : "Station added");
    setForm({ ...EMPTY });
    setEditingId(null);
    void load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("partner_tvs").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Station deleted");
    void load();
  };

  const edit = (row: PartnerTv) => {
    setEditingId(row.id);
    setForm({
      name: row.name,
      logo_url: row.logo_url ?? "",
      live_stream_url: row.live_stream_url,
      category: row.category,
      region: row.region ?? "",
      description: row.description ?? "",
      is_active: row.is_active,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const input =
    "w-full rounded-lg bg-[#1E1E1E] px-3 py-2.5 text-sm text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-red-500/60";

  return (
    <div className="min-h-screen bg-[#121212] p-4 pb-28 text-white">
      <h1 className="mb-4 text-xl font-bold">Partner TV Stations</h1>

      <div className="space-y-3 rounded-xl bg-[#171717] p-4">
        <input
          className={input}
          placeholder="Station name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          className={input}
          placeholder="Logo URL"
          value={form.logo_url}
          onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
        />
        <input
          className={input}
          placeholder="Live stream URL (YouTube link or .m3u8)"
          value={form.live_stream_url}
          onChange={(e) => setForm({ ...form, live_stream_url: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            className={input}
            placeholder="Category"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />
          <input
            className={input}
            placeholder="Region"
            value={form.region}
            onChange={(e) => setForm({ ...form, region: e.target.value })}
          />
        </div>
        <textarea
          className={`${input} min-h-20`}
          placeholder="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <label className="flex items-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => setForm({ ...form, is_active: !form.is_active })}
            className={`relative h-6 w-11 rounded-full transition ${
              form.is_active ? "bg-green-600" : "bg-white/20"
            }`}
            aria-pressed={form.is_active}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
                form.is_active ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
          Active (visible on /stations)
        </label>

        <div className="flex gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-bold disabled:opacity-50"
          >
            {saving ? "Saving…" : editingId ? "Update station" : "Save station"}
          </button>
          {editingId ? (
            <button
              onClick={() => {
                setEditingId(null);
                setForm({ ...EMPTY });
              }}
              className="rounded-xl bg-[#1E1E1E] px-4 text-sm"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center gap-3 rounded-xl bg-[#1E1E1E] p-3">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-black">
              {row.logo_url ? (
                <img src={row.logo_url} alt={row.name} className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{row.name}</p>
              <p className="truncate text-xs text-white/50">
                {row.category} • {row.is_active ? "Active" : "Hidden"} • {row.viewer_count} views
              </p>
            </div>
            <button
              onClick={() => edit(row)}
              className="rounded-lg p-2 hover:bg-white/10"
              aria-label="Edit"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() => void remove(row.id)}
              className="rounded-lg p-2 text-red-400 hover:bg-white/10"
              aria-label="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-white/40">No stations yet.</p>
        ) : null}
      </div>
    </div>
  );
}
