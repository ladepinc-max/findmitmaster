import { supabase } from "@/integrations/supabase/client";

export interface LiveHost {
  id: string;
  username: string;
  display_name: string;
  photo_path: string | null;
}

export interface LiveClass {
  id: string;
  host_id: string;
  topic: string;
  description: string;
  thumbnail_path: string | null;
  is_live: boolean;
  viewers_count: number;
  room_name: string;
  hls_url: string | null;
  practical_price: number;
  practical_currency: string;
  started_at: string;
  ended_at: string | null;
  host: LiveHost | null;
}

const LIVE_SELECT =
  "*, host:profiles!live_classes_host_id_fkey(id,username,display_name,photo_path)";

export async function fetchLiveClasses() {
  const { data, error } = await supabase
    .from("live_classes")
    .select(LIVE_SELECT)
    .eq("is_live", true)
    // Only list classes whose teacher broadcast is ready, so students never
    // land on a "waiting for camera" screen.
    .not("hls_url", "is", null)
    .order("started_at", { ascending: false });
  if (error) throw error;
  return ((data as unknown as LiveClass[] | null) ?? []);
}

export async function startLiveClass(hostId: string, topic: string, description: string) {
  const roomName = `findmeet-${hostId.slice(0, 8)}-${Date.now().toString(36)}`;
  const { data, error } = await supabase
    .from("live_classes")
    .insert({ host_id: hostId, topic, description, room_name: roomName, is_live: true })
    .select(LIVE_SELECT)
    .single();
  if (error) throw error;
  return data as unknown as LiveClass;
}

export async function endLiveClass(id: string) {
  const { error } = await supabase
    .from("live_classes")
    .update({ is_live: false, ended_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function joinLiveClass(item: LiveClass) {
  await supabase
    .from("live_classes")
    .update({ viewers_count: item.viewers_count + 1 })
    .eq("id", item.id);
}
