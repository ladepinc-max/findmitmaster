import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface QuickApp {
  id: string;
  label: string;
  url: string;
  color: string;
  icon_text: string;
  sort_order: number;
}

export interface FeedItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  image_url: string | null;
  link_url: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

/** True when the input looks like a website address rather than a search phrase. */
export function looksLikeUrl(input: string): boolean {
  const s = input.trim();
  if (!s || /\s/.test(s)) return false;
  if (/^https?:\/\//i.test(s)) return true;
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/.*)?$/i.test(s);
}

/** Adds https:// when missing. */
export function normalizeUrl(input: string): string {
  const s = input.trim();
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

/** Well-known site names users type without a domain. */
export const SITE_ALIASES: Record<string, string> = {
  ghanaweb: "https://www.ghanaweb.com",
  jumia: "https://www.jumia.com.gh",
  tonaton: "https://tonaton.com",
  myjoyonline: "https://www.myjoyonline.com",
  joyonline: "https://www.myjoyonline.com",
  peacefm: "https://www.peacefmonline.com",
  peacefmonline: "https://www.peacefmonline.com",
  citinewsroom: "https://citinewsroom.com",
  graphic: "https://www.graphic.com.gh",
  modernghana: "https://www.modernghana.com",
  pulse: "https://www.pulse.com.gh",
  adomonline: "https://www.adomonline.com",
  wikipedia: "https://en.m.wikipedia.org",
  youtube: "https://m.youtube.com",
  facebook: "https://m.facebook.com",
  bbc: "https://www.bbc.com",
  cnn: "https://edition.cnn.com",
  waec: "https://www.waecgh.org",
  ges: "https://ges.gov.gh",
  ecg: "https://www.ecg.com.gh",
};

/** Returns a direct website for a typed URL or known site name, else null (→ native search). */
export function resolveDestination(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (looksLikeUrl(s)) return normalizeUrl(s);
  const key = s.toLowerCase().replace(/[\s.]+/g, "").replace(/(com|gh|org)$/,"");
  return SITE_ALIASES[s.toLowerCase().replace(/\s+/g, "")] ?? SITE_ALIASES[key] ?? null;
}

/** Sites that refuse to load inside other apps — these open directly in the phone's browser/app. */
const EMBED_BLOCKED = [
  "youtube.com", "youtu.be", "facebook.com", "fb.com", "instagram.com", "twitter.com", "x.com",
  "tiktok.com", "whatsapp.com", "google.com", "news.google.com", "linkedin.com", "netflix.com",
  "bbc.com", "bbc.co.uk", "cnn.com", "jumia.com.gh", "amazon.com", "github.com", "reddit.com",
  "skysports.com", "espn.com", "telegram.org", "snapchat.com", "pinterest.com",
];

export function isEmbedBlocked(url: string): boolean {
  try {
    const h = new URL(url).hostname.replace(/^(www|m|mobile|edition)\./, "");
    return EMBED_BLOCKED.some((d) => h === d || h.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

export function useQuickApps() {
  const [apps, setApps] = useState<QuickApp[]>([]);
  const reload = useCallback(async () => {
    const { data } = await supabase.from("home_quick_apps").select("*").order("sort_order").order("created_at");
    setApps((data ?? []) as QuickApp[]);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { apps, reload };
}

export function useHomeFeed() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const reload = useCallback(async () => {
    const { data } = await supabase
      .from("home_feed_items")
      .select("*")
      .order("sort_order")
      .order("created_at", { ascending: false });
    setItems((data ?? []) as FeedItem[]);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { items, reload };
}
