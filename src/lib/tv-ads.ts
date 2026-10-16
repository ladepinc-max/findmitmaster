import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TvFolderAd {
  id: string;
  folder_id: string;
  video_url: string;
  title: string | null;
  is_published: boolean;
  created_at: string;
}

export interface TvAdSettings {
  folder_id: string;
  ad_interval_minutes: number;
  ads_per_break: number;
  moving_text: string;
  moving_text_draft: string;
  moving_text_enabled: boolean;
  moving_text_speed: number;
  moving_text_position: "top" | "bottom";
  moving_text_published: boolean;
  updated_at: string;
}

// New tables may not be in generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export async function fetchAds(folderId: string, publishedOnly: boolean): Promise<TvFolderAd[]> {
  let q = db.from("tv_folder_ads").select("*").eq("folder_id", folderId).order("created_at");
  if (publishedOnly) q = q.eq("is_published", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as TvFolderAd[];
}

export async function fetchAdSettings(folderId: string): Promise<TvAdSettings | null> {
  const { data } = await db.from("tv_ad_settings").select("*").eq("folder_id", folderId).maybeSingle();
  return (data as TvAdSettings | null) ?? null;
}

export async function updateAdSettings(folderId: string, patch: Partial<TvAdSettings>) {
  const { error } = await db.from("tv_ad_settings").upsert({ folder_id: folderId, ...patch }, { onConflict: "folder_id" });
  if (error) throw error;
}

export async function uploadAd(folderId: string, file: File) {
  const path = `${folderId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
  const { error } = await supabase.storage.from("tv-ads").upload(path, file, { contentType: file.type });
  if (error) throw error;
  const { error: e2 } = await db
    .from("tv_folder_ads")
    .insert({ folder_id: folderId, video_url: path, title: file.name, is_published: false });
  if (e2) throw e2;
}

export async function setAdPublished(id: string, is_published: boolean) {
  const { error } = await db.from("tv_folder_ads").update({ is_published }).eq("id", id);
  if (error) throw error;
}

export async function deleteAd(ad: TvFolderAd) {
  await supabase.storage.from("tv-ads").remove([ad.video_url]);
  const { error } = await db.from("tv_folder_ads").delete().eq("id", ad.id);
  if (error) throw error;
}

export async function adVideoUrl(path: string) {
  if (/^https?:\/\//.test(path)) return path;
  const { data } = await supabase.storage.from("tv-ads").createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

/** Live settings + published ads for a folder, kept fresh via realtime. */
export function useFolderAds(folderId: string) {
  const [settings, setSettings] = useState<TvAdSettings | null>(null);
  const [ads, setAds] = useState<TvFolderAd[]>([]);
  useEffect(() => {
    let alive = true;
    void fetchAdSettings(folderId).then((s) => alive && setSettings(s));
    void fetchAds(folderId, true).then((a) => alive && setAds(a)).catch(() => {});
    const channel = supabase
      .channel(`tv_ads_${folderId}_${Math.random().toString(36).slice(2, 7)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tv_ad_settings", filter: `folder_id=eq.${folderId}` },
        (payload) => {
          if (alive && payload.new && "folder_id" in payload.new) setSettings(payload.new as TvAdSettings);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tv_folder_ads", filter: `folder_id=eq.${folderId}` },
        () => void fetchAds(folderId, true).then((a) => alive && setAds(a)).catch(() => {}),
      )
      .subscribe();
    return () => {
      alive = false;
      void supabase.removeChannel(channel);
    };
  }, [folderId]);
  return { settings, ads };
}
