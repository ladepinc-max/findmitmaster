import { supabase } from "@/integrations/supabase/client";

export interface GpsPoint {
  lat: number;
  lng: number;
  accuracy: number;
  speed: number | null;
  at: number;
}

export interface CaptureResult {
  point: GpsPoint;
  quality: "good" | "poor" | "blocked";
  message: string;
}

function toPoint(p: GeolocationPosition): GpsPoint {
  return {
    lat: p.coords.latitude,
    lng: p.coords.longitude,
    accuracy: p.coords.accuracy,
    speed: p.coords.speed,
    at: p.timestamp,
  };
}

function readOnce(): Promise<GpsPoint> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(toPoint(p)),
      reject,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

function average(points: GpsPoint[]): GpsPoint {
  const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const lng = points.reduce((s, p) => s + p.lng, 0) / points.length;
  const accuracy = points.reduce((s, p) => s + p.accuracy, 0) / points.length;
  return { lat, lng, accuracy, speed: null, at: Date.now() };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Ghana indoor GPS fix: 1 reading if <10m, 3 readings averaged if 10-20m,
 * 5 readings (worst removed) if >20m. Blocks saving when final accuracy >15m.
 */
export async function captureAccurateLocation(): Promise<CaptureResult> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return {
      point: { lat: 0, lng: 0, accuracy: 9999, speed: null, at: 0 },
      quality: "blocked",
      message: "This phone does not support GPS.",
    };
  }
  try {
    const first = await readOnce();
    if (first.accuracy < 10) {
      return { point: first, quality: "good", message: "Accurate - Good to save" };
    }
    if (first.accuracy <= 20) {
      const more = [first];
      for (let i = 0; i < 2; i++) {
        await wait(1000);
        more.push(await readOnce());
      }
      more.sort((a, b) => a.accuracy - b.accuracy);
      const avg = average(more.slice(0, 2));
      return avg.accuracy < 15
        ? { point: avg, quality: "good", message: "Accurate - Good to save" }
        : { point: avg, quality: "blocked", message: "Step outside to save accurate location" };
    }
    const readings = [first];
    for (let i = 0; i < 4; i++) {
      await wait(1000);
      readings.push(await readOnce());
    }
    readings.sort((a, b) => a.accuracy - b.accuracy);
    const avg = average(readings.slice(0, 4)); // drop the worst
    if (avg.accuracy > 15) {
      return {
        point: avg,
        quality: "blocked",
        message:
          "Accuracy poor - Move outside or near window. Ghana blocks block GPS. Step outside to save accurate location.",
      };
    }
    return {
      point: avg,
      quality: "poor",
      message: "Accuracy fair - saved, but stand outside next time for best results",
    };
  } catch {
    return {
      point: { lat: 0, lng: 0, accuracy: 9999, speed: null, at: 0 },
      quality: "blocked",
      message: "Location permission denied. Allow location and try again.",
    };
  }
}

/** Rough Plus Code-style short code for display (real OLC needs a lib; this is a readable local code). */
export function localPlusCode(lat: number, lng: number): string {
  const a = Math.abs(Math.round(lat * 1000)).toString(36).toUpperCase();
  const b = Math.abs(Math.round(lng * 1000)).toString(36).toUpperCase();
  const area = lat > 4.7 && lat < 11.2 && lng > -3.3 && lng < 1.3 ? "Ghana" : "";
  return `${a}${b}+${Math.abs(Math.round((lat + lng) * 100)).toString(36).toUpperCase()} ${area}`.trim();
}

/** Haversine distance in metres. */
export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// ---------- Journeys / road learning ----------

export async function saveTracePoint(journeyId: string, userId: string, p: GpsPoint) {
  await supabase.from("gps_traces").insert({
    journey_id: journeyId,
    user_id: userId,
    lat: p.lat,
    lng: p.lng,
    accuracy: p.accuracy,
    speed: p.speed,
  });
}

export async function finishJourney(
  userId: string,
  builderName: string,
  trace: GpsPoint[],
  trustScore: number,
) {
  if (trace.length < 2) throw new Error("Journey too short");
  const start = trace[0]!;
  const end = trace[trace.length - 1]!;
  let dist = 0;
  for (let i = 1; i < trace.length; i++) {
    dist += distanceM(trace[i - 1]!.lat, trace[i - 1]!.lng, trace[i]!.lat, trace[i]!.lng);
  }
  const status = trustScore >= 10 ? "verified" : "pending";
  const { error } = await supabase.from("verified_routes").insert({
    start_lat: start.lat,
    start_lng: start.lng,
    end_lat: end.lat,
    end_lng: end.lng,
    trace: trace.map((p) => [p.lat, p.lng]),
    distance_km: Math.round((dist / 1000) * 100) / 100,
    status,
    created_by: userId,
    builder_name: builderName,
    trust_score: trustScore,
  });
  if (error) throw error;
  const { data: b } = await supabase
    .from("road_builders")
    .select("total_routes, verified_routes")
    .eq("user_id", userId)
    .maybeSingle();
  if (b) {
    await supabase
      .from("road_builders")
      .update({
        total_routes: (b.total_routes ?? 0) + 1,
        verified_routes: (b.verified_routes ?? 0) + (status === "verified" ? 1 : 0),
      })
      .eq("user_id", userId);
  }
  return status;
}

export interface VerifiedRoute {
  id: string;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  distance_km: number | null;
  times_used: number;
  builder_name: string | null;
}

/** Finds a verified road ending near the destination and starting near the user. */
export async function findVerifiedRoute(
  userLat: number,
  userLng: number,
  destLat: number,
  destLng: number,
): Promise<VerifiedRoute | null> {
  const { data } = await supabase
    .from("verified_routes")
    .select("id, start_lat, start_lng, end_lat, end_lng, distance_km, times_used, builder_name")
    .eq("status", "verified")
    .limit(500);
  const match = (data ?? []).find(
    (r) =>
      distanceM(r.end_lat, r.end_lng, destLat, destLng) <= 20 &&
      distanceM(r.start_lat, r.start_lng, userLat, userLng) <= 3000,
  );
  return match ?? null;
}

// ---------- Road builders ----------

export async function getBuilder(userId: string) {
  const { data } = await supabase.from("road_builders").select("*").eq("user_id", userId).maybeSingle();
  return data;
}

export async function joinBuilders(userId: string, name: string, areas: string) {
  const { error } = await supabase.from("road_builders").upsert({
    user_id: userId,
    name,
    areas_known: areas,
    status: "active",
  });
  if (error) throw error;
}

export async function topBuilders() {
  const { data } = await supabase
    .from("road_builders")
    .select("name, areas_known, verified_routes, impact_count, volunteer_badge")
    .order("verified_routes", { ascending: false })
    .limit(10);
  return data ?? [];
}

// ---------- Community naming ----------

export async function uploadCommunityPhoto(userId: string, file: Blob, ext: string) {
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("community-photos").upload(path, file);
  if (error) throw error;
  return path;
}

export async function uploadVoiceNote(userId: string, blob: Blob, ext: string) {
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("community-voice-notes").upload(path, blob);
  if (error) throw error;
  return path;
}

export async function signedUrl(bucket: string, path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/** Submits a community name; confirms an existing nearby same-name entry instead of duplicating. */
export async function submitCommunityName(input: {
  userId: string;
  lat: number;
  lng: number;
  name: string;
  photoPath: string | null;
  voicePath: string | null;
  transcription: string | null;
  language: string | null;
  landmark?: string | null;
  plusCode?: string | null;
  pinX?: number | null;
  pinY?: number | null;
}) {
  const { data: existing } = await supabase
    .from("community_names")
    .select("id, lat, lng, times_confirmed, photo_url, voice_note_url")
    .ilike("community_name", input.name)
    .limit(20);
  const near = (existing ?? []).find((c) => distanceM(c.lat, c.lng, input.lat, input.lng) <= 50);
  if (near) {
    const hasProof = Boolean(near.photo_url || input.photoPath) && Boolean(near.voice_note_url || input.voicePath);
    const r = await confirmCommunity(near.id, input.photoPath, input.voicePath);
    return { verified: r.verified, gold: r.verified && hasProof, confirmations: r.confirmations };
  }
  const { error } = await supabase.from("community_names").insert({
    lat: input.lat,
    lng: input.lng,
    community_name: input.name,
    submitted_by: input.userId,
    photo_url: input.photoPath,
    voice_note_url: input.voicePath,
    transcription: input.transcription,
    language_detected: input.language,
    landmark: input.landmark ?? null,
    plus_code: input.plusCode ?? null,
    photo_pin_x: input.pinX ?? null,
    photo_pin_y: input.pinY ?? null,
  } as never);
  if (error) throw error;
  return { verified: false, gold: false, confirmations: 1 };
}

export async function nearbyCommunities(lat: number, lng: number) {
  const { data } = await supabase
    .from("community_names")
    .select("id, lat, lng, community_name, verified, times_confirmed, photo_url, voice_note_url")
    .order("created_at", { ascending: false })
    .limit(300);
  return (data ?? [])
    .map((c) => ({ ...c, distance: distanceM(lat, lng, c.lat, c.lng) }))
    .filter((c) => c.distance <= 5000)
    .sort((a, b) => a.distance - b.distance);
}

// ---------- Photo compression + watermark ----------

/** Shrinks a photo to max 800px and burns GPS + time into the corner. */
export async function compressAndWatermark(file: Blob, lat: number, lng: number, accuracy: number): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, 800 / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, w, h);
    const lines = [
      `GPS ${lat.toFixed(6)}, ${lng.toFixed(6)}  ±${Math.round(accuracy)}m`,
      new Date().toLocaleString("en-GH"),
      "FindMit Ghana Community Map",
    ];
    const fs = Math.max(12, Math.round(w / 40));
    ctx.font = `bold ${fs}px sans-serif`;
    const boxH = fs * 1.4 * lines.length + fs * 0.6;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, h - boxH, w, boxH);
    ctx.fillStyle = "#ffffff";
    lines.forEach((t, i) => ctx.fillText(t, fs * 0.6, h - boxH + fs * 1.3 * (i + 1)));
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("compress failed"))), "image/jpeg", 0.8),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------- Confirmations, slicing, anti-fake ----------

export async function confirmCommunity(id: string, photo: string | null, voice: string | null) {
  const { data, error } = await supabase.rpc("confirm_community_name", { _id: id, _photo: photo as string, _voice: voice as string });
  if (error) throw error;
  const row = (data ?? [])[0];
  return { verified: Boolean(row?.verified), confirmations: row?.confirmations ?? 1 };
}

export interface PendingRoute {
  id: string;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  distance_km: number | null;
  builder_name: string | null;
  trace: unknown;
}

export async function nearbyPendingRoutes(lat: number, lng: number): Promise<PendingRoute[]> {
  const { data } = await supabase.rpc("nearby_pending_routes", { _lat: lat, _lng: lng });
  return (data ?? []) as PendingRoute[];
}

export async function confirmRoute(routeId: string, correct: boolean, note: string, lat: number | null, lng: number | null) {
  const { data, error } = await supabase.rpc("confirm_route", {
    _route_id: routeId,
    _correct: correct,
    _note: note,
    _lat: lat as number,
    _lng: lng as number,
  });
  if (error) throw error;
  return data as string;
}

export function traceToPoints(trace: unknown): [number, number][] {
  if (!Array.isArray(trace)) return [];
  return trace.filter((p) => Array.isArray(p) && p.length >= 2).map((p) => [Number(p[0]), Number(p[1])]);
}

/** Cuts a road so it starts at the point nearest the user and ends nearest the destination. */
export function sliceRoute(points: [number, number][], from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  if (points.length < 2) return points;
  const nearest = (t: { lat: number; lng: number }) => {
    let best = 0;
    let bestD = Infinity;
    points.forEach(([la, ln], i) => {
      const d = distanceM(la, ln, t.lat, t.lng);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  };
  const a = nearest(from);
  const b = nearest(to);
  return a <= b ? points.slice(a, b + 1) : points.slice(b, a + 1).reverse();
}

/** True when 95%+ of a new trace lies within 15m of one of the user's recent roads. */
export async function isDuplicateRoute(userId: string, trace: GpsPoint[]) {
  const { data } = await supabase
    .from("verified_routes")
    .select("trace")
    .eq("created_by", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  for (const row of data ?? []) {
    const old = traceToPoints(row.trace);
    if (old.length < 2) continue;
    const close = trace.filter((p) => old.some(([la, ln]) => distanceM(la, ln, p.lat, p.lng) <= 15)).length;
    if (close / trace.length >= 0.95) return true;
  }
  return false;
}

export async function coverageRoads(lat: number, lng: number) {
  const { data } = await supabase
    .from("verified_routes")
    .select("id, status, trace, start_lat, start_lng")
    .gte("start_lat", lat - 0.05)
    .lte("start_lat", lat + 0.05)
    .gte("start_lng", lng - 0.05)
    .lte("start_lng", lng + 0.05)
    .limit(200);
  const pending = await nearbyPendingRoutes(lat, lng);
  const rows = [
    ...(data ?? [])
      .filter((r) => r.status !== "rejected" && r.status !== "closed")
      .map((r) => ({ id: r.id, verified: r.status === "verified", pending: r.status === "pending", points: traceToPoints(r.trace) })),
    ...pending.map((r) => ({ id: r.id, verified: false, pending: true, points: traceToPoints(r.trace) })),
  ];
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}

// ---------- Search decoding (code / coordinates) ----------

/** Turns "5.6037, -0.1870" or a FindMit code (e.g. "4BV2K+1C Ghana") into coordinates. */
export function decodePlaceQuery(q: string): { lat: number; lng: number; kind: "coords" | "code" } | null {
  const s = q.trim();
  const m = s.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if (m) {
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng, kind: "coords" };
  }
  const c = s.toUpperCase().replace(/\s*GHANA\s*$/, "").replace(/\s+/g, "");
  const cm = c.match(/^([0-9A-Z]{3})([0-9A-Z]{1,3})\+([0-9A-Z]+)$/);
  if (cm) {
    const latAbs = parseInt(cm[1]!, 36) / 1000;
    const lngAbs = parseInt(cm[2]!, 36) / 1000;
    const check = parseInt(cm[3]!, 36);
    if (!Number.isFinite(latAbs) || !Number.isFinite(lngAbs)) return null;
    for (const lat of [latAbs, -latAbs]) {
      for (const lng of [-lngAbs, lngAbs]) {
        if (Math.abs(Math.round((lat + lng) * 100)) === check) return { lat, lng, kind: "code" };
      }
    }
    return { lat: latAbs, lng: -lngAbs, kind: "code" };
  }
  return null;
}

// ---------- Shortest volunteer road ----------

export interface BestRoute {
  id: string;
  points: [number, number][];
  builderName: string | null;
  totalM: number;
  verified: boolean;
  source?: RouteSource;
}

function pathLen(p: [number, number][]) {
  let d = 0;
  for (let i = 1; i < p.length; i++) d += distanceM(p[i - 1]![0], p[i - 1]![1], p[i]![0], p[i]![1]);
  return d;
}

/**
 * Looks at every verified volunteer road near the trip, cuts each one between the
 * point closest to the user and the point closest to the destination, and returns
 * the one with the shortest total trip (walk to road + road + walk to destination).
 * Only roads that actually help (beat walking straight by detours < 1.6x) are used.
 */
export type TravelMode = "walk" | "drive";

export async function findBestRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  mode: TravelMode = "walk",
): Promise<BestRoute | null> {
  const pad = 0.05;
  let q = supabase
    .from("verified_routes")
    .select("id, trace, builder_name, status, source, motorable, start_lat, start_lng, end_lat, end_lng")
    .not("status", "in", "(rejected,closed)")
    .gte("end_lat", Math.min(from.lat, to.lat) - pad)
    .lte("end_lat", Math.max(from.lat, to.lat) + pad)
    .limit(300);
  if (mode === "drive") q = q.eq("motorable", true);
  const { data } = await q;
  const direct = distanceM(from.lat, from.lng, to.lat, to.lng);
  let best: BestRoute | null = null;
  for (const r of data ?? []) {
    const pts = traceToPoints(r.trace);
    if (pts.length < 2) continue;
    const seg = sliceRoute(pts, from, to);
    if (seg.length < 2) continue;
    const a = seg[0]!;
    const b = seg[seg.length - 1]!;
    const walkIn = distanceM(from.lat, from.lng, a[0], a[1]);
    const walkOut = distanceM(b[0], b[1], to.lat, to.lng);
    if (walkOut > 150 || walkIn > 3000) continue;
    const total = walkIn + pathLen(seg) + walkOut;
    if (total > direct * 1.6 + 200) continue;
    if (!best || total < best.totalM) {
      best = {
        id: String(r.id),
        points: seg,
        builderName: (r.builder_name as string | null) ?? null,
        totalM: total,
        verified: r.status === "verified",
        source: (r.source as RouteSource) ?? "walked",
      };
    }
  }
  return best;
}

export type RouteSource = "walked" | "traced" | "ai" | "osrm";
export type PathType = "footpath" | "dirt" | "paved";

/** Saves a path a volunteer drew on the satellite map. */
export async function saveTracedPath(input: {
  userId: string;
  builderName: string;
  points: [number, number][];
  pathType: PathType;
  motorable: boolean;
  localName: string;
  note: string;
}) {
  if (input.points.length < 2) throw new Error("Tap at least 2 points along the path");
  const s = input.points[0]!;
  const e = input.points[input.points.length - 1]!;
  const { error } = await supabase.from("verified_routes").insert({
    start_lat: s[0],
    start_lng: s[1],
    end_lat: e[0],
    end_lng: e[1],
    trace: input.points,
    distance_km: Math.round((pathLen(input.points) / 1000) * 100) / 100,
    status: "pending",
    created_by: input.userId,
    builder_name: input.builderName,
    trust_score: 0,
    source: "traced",
    path_type: input.pathType,
    motorable: input.pathType === "paved" ? true : input.motorable,
    local_name: input.localName || null,
    note: input.note || null,
  });
  if (error) throw error;
}

/** Public road network fallback (OpenStreetMap routing, free). */
export async function publicRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  mode: TravelMode,
): Promise<[number, number][] | null> {
  const profile = mode === "walk" ? "routed-foot" : "routed-car";
  try {
    const res = await fetch(
      `https://routing.openstreetmap.de/${profile}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`,
    );
    if (!res.ok) return null;
    const j = (await res.json()) as { routes?: { geometry: { coordinates: [number, number][] } }[] };
    const c = j.routes?.[0]?.geometry.coordinates;
    return c && c.length > 1 ? c.map(([lng, lat]) => [lat, lng] as [number, number]) : null;
  } catch {
    return null;
  }
}

/**
 * Walking fallback: stores the calculated path as a FindMit candidate so walkers can confirm it.
 * Reuses an existing candidate for the same trip; returns null when that candidate was closed.
 */
export async function aiCandidatePath(
  userId: string,
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<BestRoute | null> {
  const { data: existing } = await supabase
    .from("verified_routes")
    .select("id, trace, status, start_lat, start_lng, end_lat, end_lng")
    .eq("source", "ai")
    .gte("end_lat", to.lat - 0.0005)
    .lte("end_lat", to.lat + 0.0005)
    .limit(50);
  const match = (existing ?? []).find(
    (r) =>
      distanceM(r.end_lat, r.end_lng, to.lat, to.lng) <= 40 &&
      distanceM(r.start_lat, r.start_lng, from.lat, from.lng) <= 60,
  );
  if (match) {
    if (match.status === "rejected" || match.status === "closed") return null;
    const pts = traceToPoints(match.trace);
    return { id: match.id, points: pts, builderName: "FindMit AI", totalM: pathLen(pts), verified: match.status === "verified", source: "ai" };
  }
  const pts = await publicRoute(from, to, "walk");
  if (!pts) return null;
  const { data, error } = await supabase
    .from("verified_routes")
    .insert({
      start_lat: from.lat,
      start_lng: from.lng,
      end_lat: to.lat,
      end_lng: to.lng,
      trace: pts,
      distance_km: Math.round((pathLen(pts) / 1000) * 100) / 100,
      status: "pending",
      created_by: userId,
      builder_name: "FindMit AI",
      trust_score: 0,
      source: "ai",
      path_type: "footpath",
    })
    .select("id")
    .single();
  return { id: error || !data ? "osrm" : data.id, points: pts, builderName: "FindMit AI", totalM: pathLen(pts), verified: false, source: error ? "osrm" : "ai" };
}

export const ROAD_PROBLEMS = [
  "New wall or fence",
  "Locked gate / compound",
  "Gutter, flood or broken bridge",
  "Bush / no path",
  "Private land / security",
  "Confusing directions / missed turn",
] as const;

export async function reportRoute(input: {
  routeId: string;
  helpful: boolean;
  reason: string | null;
  note: string;
  photoPath: string | null;
  lat: number | null;
  lng: number | null;
}) {
  const { data, error } = await supabase.rpc("report_route", {
    _route_id: input.routeId,
    _helpful: input.helpful,
    _reason: input.reason as string,
    _note: input.note,
    _photo: input.photoPath as string,
    _lat: input.lat as number,
    _lng: input.lng as number,
  });
  if (error) throw error;
  return data as string;
}

// ---------- Photo landmarks (doorstep photos with pinned arrow) ----------

export interface PhotoPlace {
  id: string;
  lat: number;
  lng: number;
  name: string;
  landmark: string | null;
  photoPath: string;
  pinX: number | null;
  pinY: number | null;
  verified: boolean;
}

/** Saved places with a photo within ~radiusDeg of a point. */
export async function photoPlacesNear(lat: number, lng: number, radiusDeg = 0.05): Promise<PhotoPlace[]> {
  const { data } = await supabase
    .from("community_names")
    .select("*")
    .not("photo_url", "is", null)
    .gte("lat", lat - radiusDeg)
    .lte("lat", lat + radiusDeg)
    .gte("lng", lng - radiusDeg)
    .lte("lng", lng + radiusDeg)
    .limit(300);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r["id"]),
    lat: Number(r["lat"]),
    lng: Number(r["lng"]),
    name: String(r["community_name"]),
    landmark: (r["landmark"] as string | null) ?? null,
    photoPath: String(r["photo_url"]),
    pinX: r["photo_pin_x"] == null ? null : Number(r["photo_pin_x"]),
    pinY: r["photo_pin_y"] == null ? null : Number(r["photo_pin_y"]),
    verified: Boolean(r["verified"]),
  }));
}
