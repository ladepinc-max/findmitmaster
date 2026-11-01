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

/** Google results page that allows being shown inside the in-app browser. */
export function webSearchUrl(q: string): string {
  return `https://www.google.com/search?igu=1&q=${encodeURIComponent(q.trim())}`;
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
