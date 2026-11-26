import { supabase } from "@/integrations/supabase/client";

export type StationKind = "police" | "fire";
export type ReportStatus = "new" | "acknowledged" | "dispatched" | "resolved";

/** Police and fire stations get the reporter layout; everything else is a normal shop. */
export function stationKind(s: { category: string; handle: string }): StationKind | null {
  if (s.category === "police" || s.handle.endsWith(".police")) return "police";
  if (s.category === "fireservice" || s.handle.endsWith(".fireservice")) return "fire";
  return null;
}

export const STATION_INCIDENTS: Record<StationKind, string[]> = {
  police: ["Report Theft", "Domestic Case", "Lost ID", "Community Help"],
  fire: ["Report Fire", "Gas Leak", "Rescue", "Fire Hazard"],
};

export const NEXT_STATUS: Record<ReportStatus, ReportStatus | null> = {
  new: "acknowledged",
  acknowledged: "dispatched",
  dispatched: "resolved",
  resolved: null,
};

export const EVIDENCE_BUCKET = "emergency-evidence";

export interface EmergencyReport {
  id: string;
  shop_id: string;
  reporter_id: string;
  incident_type: string;
  description: string | null;
  media_path: string | null;
  media_kind: "photo" | "video" | null;
  reporter_phone: string | null;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  status: ReportStatus;
  created_at: string;
}

export async function sendEmergencyReport(input: {
  shopId: string;
  reporterId: string;
  incidentType: string;
  description: string;
  phone: string;
  media: { blob: Blob; kind: "photo" | "video" } | null;
  location: { lat: number; lng: number; accuracy: number } | null;
}) {
  let media_path: string | null = null;
  if (input.media) {
    const ext = input.media.kind === "photo" ? "jpg" : input.media.blob.type.includes("mp4") ? "mp4" : "webm";
    media_path = `${input.reporterId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(EVIDENCE_BUCKET).upload(media_path, input.media.blob, { contentType: input.media.blob.type || (input.media.kind === "photo" ? "image/jpeg" : "video/webm") });
    if (error) throw error;
  }
  const { error } = await supabase.from("emergency_reports").insert({
    shop_id: input.shopId,
    reporter_id: input.reporterId,
    incident_type: input.incidentType,
    description: input.description.trim() || null,
    reporter_phone: input.phone.trim() || null,
    media_path,
    media_kind: input.media?.kind ?? null,
    lat: input.location?.lat ?? null,
    lng: input.location?.lng ?? null,
    accuracy_m: input.location?.accuracy ?? null,
  });
  if (error) throw error;
}
