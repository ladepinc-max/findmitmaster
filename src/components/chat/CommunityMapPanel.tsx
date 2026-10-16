import { useAuth } from "@/lib/auth";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  Flag,
  Loader2,
  MapPin,
  Mic,
  Navigation,
  Square,
  Trophy,
  Volume2,
  ThumbsUp,
  Store,
} from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { categoryEmoji } from "@/lib/shops";
import { CommunityMapView, type MapRoad } from "@/components/chat/CommunityMapView";
import type { NavTarget } from "@/components/chat/LiveNavigation";
import { SatelliteTracer } from "@/components/chat/SatelliteTracer";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  captureAccurateLocation,
  finishJourney,
  getBuilder,
  joinBuilders,
  localPlusCode,
  nearbyCommunities,
  saveTracePoint,
  signedUrl,
  distanceM,
  submitCommunityName,
  topBuilders,
  uploadCommunityPhoto,
  uploadVoiceNote,
  compressAndWatermark,
  confirmRoute,
  nearbyPendingRoutes,
  isDuplicateRoute,
  coverageRoads,
  traceToPoints,
  type PendingRoute,
  type CaptureResult,
  type GpsPoint,
  decodePlaceQuery,
} from "@/lib/community-map";
import { Copy, MessageSquare, Share2 } from "lucide-react";
import { InAppCamera } from "@/components/chat/InAppCamera";
import { PhotoPinner } from "@/components/chat/PinnedPhoto";
import { shareNative, shareSms, shareWhatsApp } from "@/lib/share-location";
import { clearDraft, loadDraft, saveDraft } from "@/lib/form-draft";

const DRAFT_KEY = "community-map-place";

type Tab = "map" | "journey" | "builder";

export function CommunityMapPanel({
  userId,
  displayName,
  onBack,
  onNavigate,
}: {
  userId: string;
  displayName: string;
  onBack: () => void;
  onNavigate?: (t: NavTarget) => void;
}) {
  const [tab, setTab] = useState<Tab>("map");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<
    {
      id: string;
      lat: number;
      lng: number;
      community_name: string;
      verified: boolean;
      landmark: string | null;
      thumb: string | null;
      distance: number | null;
    }[]
  >([]);
  const [searchHere, setSearchHere] = useState<{ lat: number; lng: number } | null>(null);
  const [shopResults, setShopResults] = useState<
    { id: string; handle: string; name: string; lat: number; lng: number; landmark: string | null; category: string; distance: number | null }[]
  >([]);
  const navigateTo = useNavigate();
  const hereAsked = useRef(false);
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setResults([]);
      setShopResults([]);
      return;
    }
    if (!hereAsked.current && navigator.geolocation) {
      hereAsked.current = true;
      navigator.geolocation.getCurrentPosition(
        (p) => setSearchHere({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => undefined,
        { enableHighAccuracy: false, maximumAge: 60000, timeout: 10000 },
      );
    }
    const t = window.setTimeout(() => {
      // Paid shops only (RLS hides unpaid/expired ones). "@ama" searches handles.
      const term = q.replace(/^@+/, "").toLowerCase().replace(/[%,()]/g, "");
      const shopQ = (supabase as unknown as { from: (t: string) => any })
        .from("shops")
        .select("id, handle, name, lat, lng, landmark, category, subscription_status, subscription_expires_at")
        .eq("subscription_status", "active")
        .gt("subscription_expires_at", new Date().toISOString())
        .not("lat", "is", null)
        .limit(200);
      void (q.startsWith("@")
        ? shopQ.ilike("handle", `${term}%`)
        : shopQ.or(`handle.ilike.%${term}%,name.ilike.%${term}%,category.ilike.%${term}%`)
      ).then(({ data }: { data: Record<string, unknown>[] | null }) => {
        const all = (data ?? []).map((r) => ({
          id: String(r["id"]),
          handle: String(r["handle"]),
          name: String(r["name"]),
          lat: Number(r["lat"]),
          lng: Number(r["lng"]),
          landmark: (r["landmark"] as string | null) ?? null,
          category: String(r["category"]),
          distance: searchHere ? distanceM(searchHere.lat, searchHere.lng, Number(r["lat"]), Number(r["lng"])) : null,
        }));
        const near = (a: { distance: number | null }, b: { distance: number | null }) =>
          (a.distance ?? 1e12) - (b.distance ?? 1e12);
        // Shop name/handle matches are shown directly; need searches (e.g. "mechanic") give the 3 nearest.
        const named = all.filter((s) => s.name.toLowerCase().includes(term) || s.handle.toLowerCase().includes(term)).sort(near);
        const byNeed = all.filter((s) => !named.includes(s)).sort(near).slice(0, 3);
        setShopResults([...named.slice(0, 10), ...byNeed]);
      });
      void supabase
        .from("community_names")
        .select("*")
        .ilike("community_name", `%${q.replace(/[%,]/g, "")}%`)
        .order("times_confirmed", { ascending: false })
        .limit(20)
        .then(async ({ data }) => {
          const rows = (data ?? []) as Record<string, unknown>[];
          const thumbs = await Promise.all(
            rows.map((r) => signedUrl("community-photos", (r["photo_url"] as string | null) ?? null).catch(() => null)),
          );
          const list = rows.map((r, i) => ({
              id: String(r["id"]),
              lat: Number(r["lat"]),
              lng: Number(r["lng"]),
              community_name: String(r["community_name"]),
              verified: Boolean(r["verified"]),
              landmark: (r["landmark"] as string | null) ?? null,
              thumb: thumbs[i] ?? null,
              distance: searchHere ? distanceM(searchHere.lat, searchHere.lng, Number(r["lat"]), Number(r["lng"])) : null,
            }));
          list.sort((a, b) => (a.distance ?? 1e12) - (b.distance ?? 1e12));
          setResults(list.slice(0, 10));
        });
    }, 300);
    return () => window.clearTimeout(t);
  }, [search, searchHere]);
  const [capture, setCapture] = useState<CaptureResult | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [communityName, setCommunityName] = useState("");
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [voice, setVoice] = useState<Blob | null>(null);
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [heardName, setHeardName] = useState("");
  const [saving, setSaving] = useState(false);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [landmark, setLandmark] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [photoPin, setPhotoPin] = useState<{ x: number; y: number } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const decoded = decodePlaceQuery(search);

  // Auto-save the form so nothing is lost if the phone reloads the page.
  const restoredRef = useRef(false);
  useEffect(() => {
    const d = loadDraft<{
      capture: CaptureResult | null;
      pin: { lat: number; lng: number } | null;
      communityName: string;
      landmark: string;
    }>(DRAFT_KEY);
    if (d) {
      if (d.capture) setCapture(d.capture);
      if (d.pin) setPin(d.pin);
      if (d.communityName) setCommunityName(d.communityName);
      if (d.landmark) setLandmark(d.landmark);
    }
    restoredRef.current = true;
  }, []);
  useEffect(() => {
    if (!restoredRef.current) return;
    saveDraft(DRAFT_KEY, { capture, pin, communityName, landmark });
  }, [capture, pin, communityName, landmark]);
  const [toReview, setToReview] = useState<PendingRoute[]>([]);
  const [badNote, setBadNote] = useState("");
  const [coverage, setCoverage] = useState<MapRoad[]>([]);
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [nearby, setNearby] = useState<Awaited<ReturnType<typeof nearbyCommunities>>>([]);

  // Journey state
  const [journeyId, setJourneyId] = useState<string | null>(null);
  const [trace, setTrace] = useState<GpsPoint[]>([]);
  const [journeySecs, setJourneySecs] = useState(0);
  const watchRef = useRef<number | null>(null);
  const traceRef = useRef<GpsPoint[]>([]);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Builder state
  const [builder, setBuilder] = useState<Awaited<ReturnType<typeof getBuilder>>>(null);
  const [leaders, setLeaders] = useState<Awaited<ReturnType<typeof topBuilders>>>([]);
  const [areas, setAreas] = useState("");

  useEffect(() => {
    void getBuilder(userId).then(setBuilder);
    void topBuilders().then(setLeaders);
  }, [userId]);

  useEffect(
    () => () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    },
    [],
  );

  const doCapture = useCallback(async () => {
    setCapturing(true);
    const result = await captureAccurateLocation();
    setCapture(result);
    setCapturing(false);
    if (result.quality !== "blocked") {
      setPin({ lat: result.point.lat, lng: result.point.lng });
      setHere({ lat: result.point.lat, lng: result.point.lng });
      void nearbyCommunities(result.point.lat, result.point.lng).then(setNearby);
    }
  }, []);

  const onPhoto = useCallback(
    async (file: Blob | null) => {
      if (!file) return;
      const spot = pin ?? (capture && capture.quality !== "blocked" ? capture.point : null);
      // Shrink + watermark right away so big camera photos never sit in memory.
      const small = spot
        ? await compressAndWatermark(file, spot.lat, spot.lng, capture?.point.accuracy ?? 0).catch(() => file)
        : file;
      setPhoto(small);
      setPhotoPreview(URL.createObjectURL(small));
      setPhotoPin(null);
    },
    [pin, capture],
  );

  const sharePlace = useCallback(
    (p: { lat: number; lng: number }) => ({
      lat: p.lat,
      lng: p.lng,
      label: communityName.trim() || "My location",
      landmark: landmark.trim() || undefined,
    }),
    [communityName, landmark],
  );

  const startVoice = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        setVoice(blob);
        setVoiceUrl(URL.createObjectURL(blob));
        setRecording(false);
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
      setTimeout(() => rec.state === "recording" && rec.stop(), 10000); // max 10s

      // Try live transcription of the spoken name (Twi/Krobo/Ewe/English).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      if (SR) {
        const sr = new SR();
        sr.lang = "en-GH";
        sr.onresult = (e: { results: { [k: number]: { [k: number]: { transcript: string } } } }) => {
          const said = e.results[0]?.[0]?.transcript?.trim();
          if (said) {
            setHeardName(said);
            setCommunityName((prev) => prev || said);
          }
        };
        sr.start();
        setTimeout(() => sr.stop(), 10000);
      }
    } catch {
      toast.error("Microphone is blocked. Allow microphone access and try again.");
    }
  }, []);

  const stopVoice = useCallback(() => recRef.current?.stop(), []);

  const saveCommunity = useCallback(async () => {
    if (!capture || capture.quality === "blocked") {
      toast.error("Capture an accurate location first (step outside).");
      return;
    }
    if (!communityName.trim()) {
      toast.error("What do you call this area? Enter the name locals use.");
      return;
    }
    if (!photo) {
      toast.error("Take a start point photo - proof you were here to help Ghana.");
      return;
    }
    setSaving(true);
    try {
      const spot = pin ?? { lat: capture.point.lat, lng: capture.point.lng };
      const small = await compressAndWatermark(photo, spot.lat, spot.lng, capture.point.accuracy).catch(() => photo);
      const photoPath = await uploadCommunityPhoto(userId, small, "jpg");
      const voicePath = voice ? await uploadVoiceNote(userId, voice, "webm") : null;
      const result = await submitCommunityName({
        userId,
        lat: spot.lat,
        lng: spot.lng,
        name: communityName.trim(),
        landmark: landmark.trim() || null,
        plusCode: localPlusCode(spot.lat, spot.lng),
        pinX: photoPin?.x ?? null,
        pinY: photoPin?.y ?? null,
        photoPath,
        voicePath,
        transcription: heardName || null,
        language: heardName ? "en-GH" : null,
      });
      await supabase.from("start_point_photos").insert({
        lat: spot.lat,
        lng: spot.lng,
        photo_url: photoPath,
        accuracy: capture.point.accuracy,
        community_name: communityName.trim(),
        created_by: userId,
      });
      toast.success(
        result.verified
          ? `${communityName.trim()} is now VERIFIED${result.gold ? " (GOLD - photo + voice)" : ""}. Medaase!`
          : `${communityName.trim()} saved. ${3 - result.confirmations} more local confirmation(s) to verify.`,
      );
      setCommunityName("");
      setPhoto(null);
      setPhotoPreview(null);
      setPhotoPin(null);
      setVoice(null);
      setVoiceUrl(null);
      setHeardName("");
      setLandmark("");
      clearDraft(DRAFT_KEY);
      void nearbyCommunities(spot.lat, spot.lng).then(setNearby);
    } catch {
      toast.error("Could not save. Check your network and try again.");
    } finally {
      setSaving(false);
    }
  }, [capture, pin, landmark, communityName, photo, voice, heardName, userId, photoPin]);

  const startJourney = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error("This phone does not support GPS.");
      return;
    }
    const id = crypto.randomUUID();
    traceRef.current = [];
    setTrace([]);
    setJourneySecs(0);
    setJourneyId(id);
    const timer = window.setInterval(() => setJourneySecs((s) => s + 1), 1000);
    watchRef.current = navigator.geolocation.watchPosition(
      (p) => {
        const point: GpsPoint = {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
          speed: p.coords.speed,
          at: p.timestamp,
        };
        // Anti-fake: reject poor accuracy and impossible speeds (>80km/h handled loosely as 22m/s+ with bad accuracy)
        if (point.accuracy > 15) return;
        const speedKmh = point.speed !== null ? point.speed * 3.6 : null;
        if (speedKmh !== null && speedKmh > 120) return;
        traceRef.current = [...traceRef.current, point];
        setTrace(traceRef.current);
        void saveTracePoint(id, userId, point);
      },
      () => toast.error("Location permission denied."),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
    const stopTimer = () => window.clearInterval(timer);
    // store cleanup on watch ref slot via closure
    (watchRef as unknown as { timer: () => void }).timer = stopTimer;
  }, [userId]);

  const endJourney = useCallback(async () => {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    (watchRef as unknown as { timer?: () => void }).timer?.();
    const points = traceRef.current;
    setJourneyId(null);
    if (points.length < 2) {
      toast.error("Journey too short - move some distance before arriving.");
      return;
    }
    try {
      if (await isDuplicateRoute(userId, points)) {
        toast.error("You already mapped this road. Thank you - try a new road!");
        return;
      }
      const trust = builder?.trust_score ?? 0;
      const status = await finishJourney(userId, displayName, points, trust);
      toast.success(
        status === "verified"
          ? "Road saved and verified instantly - thank you, trusted builder!"
          : "Road saved as PENDING. It becomes verified after 2 community confirmations.",
      );
      void getBuilder(userId).then(setBuilder);
      const last = points[points.length - 1]!;
      void nearbyPendingRoutes(last.lat, last.lng).then(setToReview);
    } catch (e) {
      const msg = e instanceof Error && e.message.includes("Too many") ? e.message : null;
      if (msg) { toast.error(msg); return; }
      toast.error("Could not save the road. Try again with network.");
    }
  }, [userId, displayName, builder]);

  const answerRoad = useCallback(
    async (r: PendingRoute, correct: boolean) => {
      try {
        const status = await confirmRoute(r.id, correct, correct ? "" : badNote.trim(), here?.lat ?? null, here?.lng ?? null);
        toast.success(
          status === "verified" ? "Thank you! This road is now verified." : correct ? "Thanks for confirming." : "Bad spot reported. Medaase!",
        );
        setBadNote("");
        setToReview((list) => list.filter((x) => x.id !== r.id));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not send. Try again.");
      }
    },
    [badNote, here],
  );

  const loadCoverage = useCallback(async () => {
    const c = await captureAccurateLocation();
    if (c.point.accuracy > 500) {
      toast.error("Turn on location to see the map near you.");
      return;
    }
    const spot = { lat: c.point.lat, lng: c.point.lng };
    setHere(spot);
    setCoverage(await coverageRoads(spot.lat, spot.lng));
    void nearbyCommunities(spot.lat, spot.lng).then(setNearby);
    void nearbyPendingRoutes(spot.lat, spot.lng).then(setToReview);
  }, []);

  const becomeBuilder = useCallback(async () => {
    try {
      await joinBuilders(userId, displayName, areas.trim());
      toast.success("Welcome, Road Builder Volunteer for Ghana!");
      void getBuilder(userId).then(setBuilder);
    } catch {
      toast.error("Could not join. Try again.");
    }
  }, [userId, displayName, areas]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-wa-panel">
      <header className="flex items-center gap-3 border-b border-wa-divider bg-card px-3 py-2">
        <Button variant="ghost" size="icon" onClick={() => { clearDraft(DRAFT_KEY); setCapture(null); setPin(null); onBack(); }} aria-label="Back">
          <ArrowLeft className="size-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">FindMit Ghana Community Map</p>
          <p className="truncate text-xs text-muted-foreground">
            Free map made by Ghanaians, for Ghana
          </p>
        </div>
        <MapPin className="size-5 text-wa-green" />
      </header>

      <div className="flex gap-1 border-b border-wa-divider bg-card px-2 py-1.5">
        {(
          [
            ["map", "Name a Place"],
            ["journey", "Learn a Road"],
            ["builder", "Volunteers"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 rounded-full px-2 py-1.5 text-xs font-medium ${
              tab === key ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {tab === "map" ? (
          <>
            <div className="rounded-2xl bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Find a place</p>
                <MyShopLink />
              </div>
              <Input
                className="mt-2"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search @shop, place name or FindMit GPS (e.g. 4D81Y+FJ)"
              />
              {shopResults.length ? (
                <ul className="mt-2 space-y-2">
                  {shopResults.map((s) => (
                    <li key={s.id} className="rounded-xl border border-border p-2">
                      <div className="flex items-center gap-2">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-lg">
                          {categoryEmoji(s.category)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{s.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            @{s.handle}
                            {s.distance != null
                              ? ` · ${s.distance >= 1000 ? `${(s.distance / 1000).toFixed(1)} km` : `${Math.round(s.distance)} m`}`
                              : ""}
                            {s.landmark ? ` · ${s.landmark}` : ""}
                          </span>
                        </span>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => onNavigate?.({ lat: s.lat, lng: s.lng, label: s.name, landmark: s.landmark ?? undefined })}
                        >
                          <Navigation className="size-4" /> Directions
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => void navigateTo({ to: "/$handle", params: { handle: `@${s.handle}` } })}
                        >
                          <Store className="size-4" /> Enter Shop
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
              {decoded ? (
                <div className="mt-2 flex items-center gap-2 rounded-xl bg-muted p-2">
                  <MapPin className="size-4 shrink-0 text-wa-green" />
                  <span className="min-w-0 flex-1 text-xs">
                    <span className="block font-medium">
                      {decoded.kind === "code" ? "FindMit GPS location" : "GPS location"}
                    </span>
                    {decoded.lat.toFixed(5)}, {decoded.lng.toFixed(5)}
                  </span>
                  <Button
                    size="sm"
                    onClick={() => onNavigate?.({ lat: decoded.lat, lng: decoded.lng, label: search.trim() })}
                  >
                    <Navigation className="size-4" /> Go
                  </Button>
                </div>
              ) : null}
              {results.length ? (
                <ul className="mt-2 divide-y divide-border">
                  {results.map((r) => (
                    <li key={r.id} className="flex items-center gap-2 py-2">
                      {r.thumb ? (
                        <img src={r.thumb} alt="" className="size-11 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <MapPin className="size-4 text-wa-green" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{r.community_name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {r.distance != null
                            ? `${r.distance >= 1000 ? `${(r.distance / 1000).toFixed(1)} km` : `${Math.round(r.distance)} m`} · `
                            : ""}
                          {r.landmark || `FindMit GPS: ${localPlusCode(r.lat, r.lng)}`}
                          {r.verified ? " · Verified" : ""}
                        </span>
                      </span>
                      <Button
                        size="sm"
                        onClick={() =>
                          onNavigate?.({
                            lat: r.lat,
                            lng: r.lng,
                            label: r.community_name,
                            landmark: r.landmark ?? undefined,
                          })
                        }
                      >
                        <Navigation className="size-4" /> Go
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : search.trim().length >= 2 ? (
                <p className="mt-2 text-xs text-muted-foreground">No places found yet.</p>
              ) : null}
            </div>

            <ShopsMap onNavigate={onNavigate} />

            <div className="rounded-2xl bg-card p-4 shadow-sm">
              <p className="text-sm font-semibold">1. Capture accurate location</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Stand outside or near a window. Ghana blocks block GPS indoors.
              </p>
              <Button
                className="mt-3 w-full"
                onClick={() => void doCapture()}
                disabled={capturing}
              >
                {capturing ? <Loader2 className="size-4 animate-spin" /> : <Navigation className="size-4" />}
                {capturing ? "Reading GPS…" : "Capture My Location"}
              </Button>
              {capture ? (
                <div
                  className={`mt-3 rounded-xl p-3 text-xs ${
                    capture.quality === "blocked"
                      ? "bg-destructive/10 text-destructive"
                      : capture.quality === "poor"
                        ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
                        : "bg-wa-green/10 text-wa-green"
                  }`}
                >
                  <p className="font-medium">{capture.message}</p>
                  {capture.quality !== "blocked" ? (
                    <p className="mt-1 text-foreground">
                      GPS: {capture.point.lat.toFixed(6)}, {capture.point.lng.toFixed(6)} · ±
                      {Math.round(capture.point.accuracy)}m · Code:{" "}
                      {localPlusCode(capture.point.lat, capture.point.lng)}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {pin ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button size="sm" variant="outline" onClick={() => shareWhatsApp(sharePlace(pin))}>
                    <Share2 className="size-4" /> WhatsApp
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => shareSms(sharePlace(pin))}>
                    <MessageSquare className="size-4" /> SMS
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void shareNative(sharePlace(pin))}>
                    <Copy className="size-4" /> Share / Copy link
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onNavigate?.(sharePlace(pin))}>
                    <Navigation className="size-4" /> Navigate
                  </Button>
                </div>
              ) : null}
              {pin ? (
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-medium">
                    Is this the exact building? If not, hold and drag the red pin.
                  </p>
                  <CommunityMapView center={pin} pin={pin} onPinMove={(lat, lng) => setPin({ lat, lng })} />
                  <p className="text-xs text-muted-foreground">
                    Pin: {pin.lat.toFixed(6)}, {pin.lng.toFixed(6)} · Code: {localPlusCode(pin.lat, pin.lng)} · 3-word
                    address: coming soon
                  </p>
                  <Input
                    value={landmark}
                    onChange={(e) => setLandmark(e.target.value)}
                    placeholder="Landmark (e.g. opposite the blue kiosk, near the big neem tree)"
                    maxLength={200}
                  />
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl bg-card p-4 shadow-sm">
              <p className="text-sm font-semibold">2. What do you call this area?</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Use the true local name, not the Google name (e.g. Abonkobi, Sra).
              </p>
              <div className="mt-3 flex gap-2">
                <Input
                  value={communityName}
                  onChange={(e) => setCommunityName(e.target.value)}
                  placeholder="e.g. Abonkobi, Sra"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant={recording ? "destructive" : "outline"}
                  size="icon"
                  onClick={recording ? stopVoice : () => void startVoice()}
                  aria-label={recording ? "Stop recording" : "Say the name"}
                >
                  {recording ? <Square className="size-4" /> : <Mic className="size-4" />}
                </Button>
              </div>
              {recording ? (
                <p className="mt-2 text-xs text-destructive">
                  🎙️ Recording… say the community name clearly (max 10 seconds)
                </p>
              ) : null}
              {heardName ? (
                <p className="mt-2 text-xs text-foreground">You said: {heardName}</p>
              ) : null}
              {voiceUrl ? (
                <div className="mt-2 flex items-center gap-2">
                  <Volume2 className="size-4 text-muted-foreground" />
                  <audio src={voiceUrl} controls className="h-8 max-w-full" />
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl bg-card p-4 shadow-sm">
              <p className="text-sm font-semibold">3. Snap start point photo</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Take a photo where you stood - proof you were here to help Ghana.
              </p>
              <button
                type="button"
                onClick={() => setCameraOpen(true)}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted px-3 py-6 text-sm text-foreground"
              >
                <Camera className="size-5" />
                {photo ? "Photo added - tap to retake" : "Open Camera"}
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="mt-2 w-full text-center text-xs text-muted-foreground underline"
              >
                Or choose from gallery
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onPhoto(e.target.files?.[0] ?? null)}
              />
              {cameraOpen ? (
                <InAppCamera
                  onShot={(b) => {
                    setCameraOpen(false);
                    onPhoto(b);
                  }}
                  onClose={() => setCameraOpen(false)}
                  onFallback={() => {
                    setCameraOpen(false);
                    fileRef.current?.click();
                  }}
                />
              ) : null}
              {photoPreview ? (
                <PhotoPinner src={photoPreview} value={photoPin} onChange={setPhotoPin} />
              ) : null}
            </div>

            <Button
              className="w-full"
              onClick={() => void saveCommunity()}
              disabled={saving || !capture || capture.quality === "blocked"}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Flag className="size-4" />}
              Save This Place for Ghana
            </Button>

            {nearby.length > 0 ? (
              <div className="rounded-2xl bg-card p-4 shadow-sm">
                <p className="text-sm font-semibold">Communities near you</p>
                <div className="mt-2 space-y-2">
                  {nearby.slice(0, 10).map((c) => (
                    <div key={c.id} className="flex items-center gap-2 text-xs">
                      <MapPin className="size-3.5 shrink-0 text-wa-green" />
                      <span className="flex-1 truncate">
                        {c.community_name}
                        {c.verified ? (
                          <span className="ml-1 font-medium text-yellow-600 dark:text-yellow-400">
                            · Verified by {c.times_confirmed} locals
                            {c.photo_url && c.voice_note_url ? " · GOLD" : ""}
                          </span>
                        ) : (
                          <span className="ml-1 text-muted-foreground">
                            · {c.times_confirmed}/3 confirmations
                          </span>
                        )}
                      </span>
                      <span className="text-muted-foreground">{Math.round(c.distance)}m</span>
                      {c.voice_note_url ? (
                        <button
                          type="button"
                          aria-label={`Hear locals say ${c.community_name}`}
                          onClick={() =>
                            void signedUrl("community-voice-notes", c.voice_note_url).then((url) => {
                              if (url) void new Audio(url).play().catch(() => undefined);
                            })
                          }
                        >
                          <Volume2 className="size-3.5 text-primary" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {tab === "journey" ? (
          <div className="rounded-2xl bg-card p-4 shadow-sm">
            <p className="text-sm font-semibold">Road Learning - free crowd-mapped roads</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Allow FindMit to learn this road to help other Ghanaians find their way. This helps
              ambulance and delivery.
            </p>
            {journeyId ? (
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="relative flex size-3">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-wa-green opacity-70" />
                    <span className="relative inline-flex size-3 rounded-full bg-wa-green" />
                  </span>
                  Tracking… {trace.length} points · {Math.floor(journeySecs / 60)}:
                  {String(journeySecs % 60).padStart(2, "0")}
                </div>
                <Button className="w-full" onClick={() => void endJourney()}>
                  <Flag className="size-4" /> I Have Arrived
                </Button>
              </div>
            ) : (
              <Button className="mt-4 w-full" onClick={startJourney}>
                <Navigation className="size-4" /> Start Journey
              </Button>
            )}
            {builder && builder.verified_routes > 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Your roads helped {builder.impact_count} Ghanaians find their way. Medaase!
              </p>
            ) : null}
          </div>
        ) : null}

        {tab === "journey" ? <SatelliteTracer userId={userId} builderName={displayName} /> : null}

        {tab === "journey" && toReview.length > 0 ? (
          <div className="rounded-2xl bg-card p-4 shadow-sm">
            <p className="text-sm font-semibold">Was this road correct?</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Roads near you waiting for 2 local confirmations.
            </p>
            <div className="mt-3 space-y-3">
              {toReview.slice(0, 5).map((r) => (
                <div key={r.id} className="rounded-xl border border-border p-3">
                  <p className="text-xs">
                    {r.distance_km ?? "?"} km road by {r.builder_name || "a volunteer"}
                  </p>
                  <div className="mt-2">
                    <CommunityMapView
                      center={{ lat: r.start_lat, lng: r.start_lng }}
                      roads={[{ id: r.id, verified: false, points: traceToPoints(r.trace) }]}
                      height={160}
                    />
                  </div>
                  <Input
                    value={badNote}
                    onChange={(e) => setBadNote(e.target.value)}
                    placeholder="If wrong: what is the bad spot?"
                    className="mt-2"
                    maxLength={300}
                  />
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" className="flex-1" onClick={() => void answerRoad(r, true)}>
                      <ThumbsUp className="size-4" /> Yes
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => void answerRoad(r, false)}>
                      <Flag className="size-4" /> Report bad spot
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {tab === "builder" ? (
          <div className="rounded-2xl bg-card p-4 shadow-sm">
            <p className="text-sm font-semibold">Coverage near you</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Green = verified roads and places. Grey = waiting for confirmation. Empty areas need you!
            </p>
            {here ? (
              <div className="mt-3">
                <CommunityMapView
                  center={here}
                  roads={coverage}
                  places={nearby.map((c) => ({ id: c.id, lat: c.lat, lng: c.lng, label: c.community_name, verified: Boolean(c.verified) }))}
                  height={280}
                />
              </div>
            ) : null}
            <Button className="mt-3 w-full" variant="outline" onClick={() => void loadCoverage()}>
              <MapPin className="size-4" /> {here ? "Refresh map" : "Show coverage map"}
            </Button>
          </div>
        ) : null}

        {tab === "builder" ? (
          <>
            {builder ? (
              <div className="rounded-2xl bg-card p-4 shadow-sm">
                <p className="text-sm font-semibold">Your volunteer record</p>
                <p className="mt-2 text-xs text-foreground">
                  {builder.total_routes} roads mapped · {builder.verified_routes} verified · Trust
                  score {builder.trust_score}
                </p>
                {builder.volunteer_badge ? (
                  <p className="mt-1 text-xs font-medium text-yellow-600 dark:text-yellow-400">
                    🏅 {builder.volunteer_badge}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-muted-foreground">
                  Areas: {builder.areas_known || "not set"}
                </p>
              </div>
            ) : (
              <div className="rounded-2xl bg-card p-4 shadow-sm">
                <p className="text-sm font-semibold">Become a Road Builder Volunteer</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  I know my area well - I want to be a Road Builder Volunteer for Ghana. No money,
                  only recognition and helping Ghana.
                </p>
                <Input
                  value={areas}
                  onChange={(e) => setAreas(e.target.value)}
                  placeholder="Areas you know well (e.g. Somanya, Abonkobi)"
                  className="mt-3"
                />
                <Button className="mt-3 w-full" onClick={() => void becomeBuilder()}>
                  Join as Volunteer
                </Button>
              </div>
            )}

            <div className="rounded-2xl bg-card p-4 shadow-sm">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Trophy className="size-4 text-yellow-500" /> Top Volunteers
              </p>
              <div className="mt-2 space-y-2">
                {leaders.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No volunteers yet - be the first in your area!
                  </p>
                ) : (
                  leaders.map((l, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="w-5 font-bold text-muted-foreground">{i + 1}.</span>
                      <span className="flex-1 truncate">
                        {l.name || "Volunteer"} · {l.areas_known || "Ghana"}
                      </span>
                      <span className="font-medium text-wa-green">{l.verified_routes} roads</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function MyShopLink() {
  const { user } = useAuth();
  const [hasShop, setHasShop] = useState(false);
  useEffect(() => {
    if (!user) return setHasShop(false);
    void (supabase as unknown as { from: (t: string) => any })
      .from("shops")
      .select("id")
      .eq("owner_id", user.id)
      .eq("subscription_status", "active")
      .limit(1)
      .then(({ data }: { data: unknown[] | null }) => setHasShop(!!data?.length));
  }, [user]);
  return (
    <Link to="/my-shop" className="text-xs font-medium text-wa-green">
      {hasShop ? "Manage shop" : "+ Register your shop"}
    </Link>
  );
}

type PinnedShop = { id: string; handle: string; name: string; lat: number; lng: number; category: string; landmark: string | null };

/** Every active registered shop appears on the map with its category symbol (💊 pharmacy, ➕ hospital, 📚 school…). */
function ShopsMap({ onNavigate }: { onNavigate?: ((t: NavTarget) => void) | undefined }) {
  const navigateTo = useNavigate();
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [shops, setShops] = useState<PinnedShop[]>([]);
  const [picked, setPicked] = useState<PinnedShop | null>(null);

  useEffect(() => {
    void (supabase as unknown as { from: (t: string) => any })
      .from("shops")
      .select("id, handle, name, lat, lng, category, landmark")
      .eq("subscription_status", "active")
      .gt("subscription_expires_at", new Date().toISOString())
      .not("lat", "is", null)
      .limit(500)
      .then(({ data }: { data: PinnedShop[] | null }) => setShops(data ?? []));
    navigator.geolocation?.getCurrentPosition(
      (p) => setCenter({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setCenter({ lat: 5.6037, lng: -0.187 }), // Accra
      { enableHighAccuracy: false, maximumAge: 120000, timeout: 8000 },
    );
  }, []);

  const pins = shops.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng, name: s.name, emoji: categoryEmoji(s.category) }));
  return (
    <div className="rounded-2xl bg-card p-4 shadow-sm">
      <p className="text-sm font-semibold">Shops & services on the map</p>
      <p className="mt-1 text-xs text-muted-foreground">
        💊 Pharmacy · ➕ Hospital · 📚 School · 🛡️ Police · 🔧 Mechanic · 🍴 Food — tap a pin.
      </p>
      {center ? (
        <div className="mt-3">
          <CommunityMapView center={center} shops={pins} onShopTap={(id) => setPicked(shops.find((s) => s.id === id) ?? null)} height={300} />
        </div>
      ) : (
        <div className="mt-3 flex h-[300px] items-center justify-center rounded-xl bg-muted">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {picked ? (
        <div className="mt-3 rounded-xl border border-border p-2">
          <div className="flex items-center gap-2">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-lg">{categoryEmoji(picked.category)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{picked.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                @{picked.handle}
                {picked.landmark ? ` · ${picked.landmark}` : ""}
              </span>
            </span>
          </div>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => onNavigate?.({ lat: picked.lat, lng: picked.lng, label: picked.name, landmark: picked.landmark ?? undefined })}
            >
              <Navigation className="size-4" /> Go
            </Button>
            <Button size="sm" className="flex-1" onClick={() => void navigateTo({ to: "/$handle", params: { handle: `@${picked.handle}` } })}>
              <Store className="size-4" /> Enter Shop
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
