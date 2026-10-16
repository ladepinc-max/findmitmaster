import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Crosshair, Loader2, MapPin, Navigation } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CommunityMapView, type MapRoad } from "@/components/chat/CommunityMapView";
import {
  distanceM,
  findBestRoute,
  localPlusCode,
  photoPlacesNear,
  signedUrl,
  type BestRoute,
  type PhotoPlace,
} from "@/lib/community-map";
import { PinnedPhoto } from "@/components/chat/PinnedPhoto";
import { RoadFeedback } from "@/components/chat/RoadFeedback";
import { useAuth } from "@/lib/auth";
import { aiCandidatePath, publicRoute, type TravelMode } from "@/lib/community-map";

export interface NavTarget {
  lat: number;
  lng: number;
  label?: string | undefined;
  landmark?: string | undefined;
}

function bearing(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = Math.PI / 180;
  const y = Math.sin((bLng - aLng) * r) * Math.cos(bLat * r);
  const x =
    Math.cos(aLat * r) * Math.sin(bLat * r) -
    Math.sin(aLat * r) * Math.cos(bLat * r) * Math.cos((bLng - aLng) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}

const DIRS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
const SHOW_WALK = false;

function fmt(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

/** Live GPS tracking from the user's position to a shared destination. */
export function LiveNavigation({ target, onClose }: { target: NavTarget; onClose: () => void }) {
  const [me, setMe] = useState<{ lat: number; lng: number; acc: number; speed: number | null; heading: number | null } | null>(null);
  const [trail, setTrail] = useState<[number, number][]>([]);
  const [arrived, setArrived] = useState(false);
  const [follow, setFollow] = useState(0);
  const arrivedRef = useRef(false);
  const [road, setRoad] = useState<BestRoute | null>(null);
  const roadAskedRef = useRef(false);
  const [photos, setPhotos] = useState<PhotoPlace[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [nearCard, setNearCard] = useState(false);
  const [chip, setChip] = useState<PhotoPlace | null>(null);
  const [peek, setPeek] = useState<PhotoPlace | null>(null);
  const seenChips = useRef(new Set<string>());
  const { user } = useAuth();
  const [mode, setMode] = useState<TravelMode>("drive");
  const [askFeedback, setAskFeedback] = useState(false);
  const [feedbackDone, setFeedbackDone] = useState(false);

  useEffect(() => {
    void photoPlacesNear(target.lat, target.lng).then(setPhotos).catch(() => undefined);
  }, [target.lat, target.lng]);

  // The destination's own doorstep photo: the closest photo spot within 25m of the target.
  const destPhoto = useMemo(() => {
    let best: PhotoPlace | null = null;
    let bd = 25;
    for (const p of photos) {
      const d = distanceM(p.lat, p.lng, target.lat, target.lng);
      if (d <= bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }, [photos, target.lat, target.lng]);

  const urlFor = (p: PhotoPlace | null) => {
    if (!p || photoUrls[p.id]) return;
    void signedUrl("community-photos", p.photoPath).then((u) => u && setPhotoUrls((m) => ({ ...m, [p.id]: u })));
  };

  // Arrival zone (50m) + en-route milestone chips (30m) for other photo spots.
  useEffect(() => {
    if (!me) return;
    if (destPhoto && distanceM(me.lat, me.lng, target.lat, target.lng) <= 50) {
      if (!nearCard) {
        setNearCard(true);
        urlFor(destPhoto);
        navigator.vibrate?.([150, 80, 150]);
      }
    }
    for (const p of photos) {
      if (p.id === destPhoto?.id || seenChips.current.has(p.id)) continue;
      if (distanceM(me.lat, me.lng, p.lat, p.lng) <= 30) {
        seenChips.current.add(p.id);
        setChip(p);
        urlFor(p);
        window.setTimeout(() => setChip((c) => (c?.id === p.id ? null : c)), 4000);
        break;
      }
    }
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!me || roadAskedRef.current) return;
    roadAskedRef.current = true;
    const from = { lat: me.lat, lng: me.lng };
    void (async () => {
      // 1) FindMit community roads, 2) suggested walking path / public car roads, 3) straight line.
      const community = await findBestRoute(from, target, mode).catch(() => null);
      if (community) return setRoad(community);
      if (mode === "walk" && user) {
        const ai = await aiCandidatePath(user.id, from, target).catch(() => null);
        if (ai) return setRoad(ai);
      }
      const pts = await publicRoute(from, target, mode);
      setRoad(pts ? { id: "osrm", points: pts, builderName: null, totalM: 0, verified: true, source: "osrm" } : null);
    })();
  }, [me, target, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchMode = (m: TravelMode) => {
    if (m === mode) return;
    setMode(m);
    setRoad(null);
    roadAskedRef.current = false;
  };
  const canRate = Boolean(user && road && road.source !== "osrm" && !feedbackDone);
  useEffect(() => {
    if (arrived && canRate) setAskFeedback(true);
  }, [arrived, canRate]);
  const close = () => {
    if (canRate && !askFeedback && trail.length > 5) return setAskFeedback(true);
    onClose();
  };

  useEffect(() => {
    if (!navigator.geolocation) {
      toast.error("Location is not available on this device");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const p = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          acc: pos.coords.accuracy,
          speed: pos.coords.speed,
          heading: pos.coords.heading,
        };
        setMe(p);
        setTrail((t) => [...t.slice(-500), [p.lat, p.lng]]);
        if (!arrivedRef.current && distanceM(p.lat, p.lng, target.lat, target.lng) <= 20) {
          arrivedRef.current = true;
          setArrived(true);
          navigator.vibrate?.([200, 100, 200]);
          toast.success("You have arrived! 🎉");
        }
      },
      () => toast.error("Allow location access to navigate"),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
    let lock: { release: () => Promise<void> } | null = null;
    void (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<typeof lock> } }).wakeLock
      ?.request("screen")
      .then((l) => (lock = l))
      .catch(() => undefined);
    return () => {
      navigator.geolocation.clearWatch(id);
      void lock?.release();
    };
  }, [target.lat, target.lng]);

  const dist = me ? distanceM(me.lat, me.lng, target.lat, target.lng) : null;
  const dir = me ? DIRS[Math.round(bearing(me.lat, me.lng, target.lat, target.lng) / 45) % 8] : "";
  const speed = me?.speed && me.speed > 0.5 ? me.speed : mode === "drive" ? 8 : 1.3; // walking default m/s
  const etaMin = dist !== null ? Math.max(1, Math.round(dist / speed / 60)) : null;

  const roads: MapRoad[] = useMemo(() => {
    const r: MapRoad[] = [];
    if (trail.length > 1) r.push({ id: "trail", points: trail, verified: false });
    if (me && road) {
      const first = road.points[0]!;
      const last = road.points[road.points.length - 1]!;
      r.push({ id: "in", points: [[me.lat, me.lng], first], verified: false });
      r.push({ id: "road", points: road.points, verified: true, pending: !road.verified });
      r.push({ id: "out", points: [last, [target.lat, target.lng]], verified: false });
    } else if (me) r.push({ id: "line", points: [[me.lat, me.lng], [target.lat, target.lng]], verified: true });
    return r;
  }, [trail, me, road, target.lat, target.lng]);

  const places = photos.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, label: p.name, verified: p.verified, photo: true }));
  const center = me ? { lat: me.lat, lng: me.lng } : { lat: target.lat, lng: target.lng };

  // Heading-up: look ~25m ahead along the route so the map turns with road curves.
  const heading = useMemo(() => {
    if (!me) return 0;
    const pts = road?.points;
    if (pts && pts.length > 1) {
      let bi = 0;
      let bd = Infinity;
      pts.forEach(([la, ln], i) => {
        const d = distanceM(me.lat, me.lng, la, ln);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      });
      if (bd < 60) {
        for (let i = bi + 1; i < pts.length; i++) {
          if (distanceM(me.lat, me.lng, pts[i]![0], pts[i]![1]) >= 25)
            return bearing(me.lat, me.lng, pts[i]![0], pts[i]![1]);
        }
      }
    }
    if (me.heading != null && !Number.isNaN(me.heading) && (me.speed ?? 0) > 0.8) return me.heading;
    if (trail.length > 1) {
      const a = trail[Math.max(0, trail.length - 4)]!;
      if (distanceM(a[0], a[1], me.lat, me.lng) > 4) return bearing(a[0], a[1], me.lat, me.lng);
    }
    return bearing(me.lat, me.lng, target.lat, target.lng);
  }, [me, road, trail, target.lat, target.lng]);
  // Smooth rotation: unwrap to avoid spinning the long way round 0/360.
  const rotRef = useRef(0);
  const rot = useMemo(() => {
    let d = heading - (rotRef.current % 360);
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    if (Math.abs(d) > 8) rotRef.current += d;
    return rotRef.current;
  }, [heading]);
  const following = follow >= 0;

  return (
    <div className="flex h-full min-h-0 flex-col bg-wa-panel">
      <header className="flex items-center gap-3 border-b border-wa-divider bg-card px-3 py-2">
        <Button variant="ghost" size="icon" onClick={close} aria-label="Back">
          <ArrowLeft className="size-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">Navigating to {target.label || "shared location"}</p>
          <p className="truncate text-xs text-muted-foreground">
            FindMit GPS: {localPlusCode(target.lat, target.lng)}
          </p>
        </div>
        <Navigation className="size-5 text-wa-green" />
      </header>

      <div className="relative min-h-0 flex-1 p-2">
        <CommunityMapView
          key={me ? "me" : "wait"}
          center={center}
          pin={{ lat: target.lat, lng: target.lng }}
          places={places}
          roads={roads}
          me={me ? { lat: me.lat, lng: me.lng, heading: following ? 0 : heading } : null}
          follow={following && me ? { lat: me.lat, lng: me.lng } : null}
          rotate={following ? rot : 0}
          onUserDrag={() => setFollow(-1)}
          height={typeof window !== "undefined" ? Math.max(320, window.innerHeight - 300) : 420}
        />
        <Button
          size="icon"
          variant={following ? "secondary" : "default"}
          className="absolute bottom-5 right-5 z-[500] rounded-full shadow"
          onClick={() => setFollow(0)}
          aria-label="Recenter on me"
        >
          <Crosshair className="size-5" />
        </Button>
        {chip ? (
          <button
            type="button"
            className="absolute left-1/2 top-4 z-[500] -translate-x-1/2 rounded-full bg-card px-4 py-2 text-xs font-medium shadow-lg"
            onClick={() => {
              setPeek(chip);
              setChip(null);
            }}
          >
            📍 Passing: {chip.name} · Tap to peek photo
          </button>
        ) : null}
        {peek ? (
          <div className="absolute inset-x-3 top-4 z-[600] rounded-2xl bg-card p-3 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">{peek.name}</p>
              <Button size="sm" variant="ghost" onClick={() => setPeek(null)}>
                Close
              </Button>
            </div>
            {photoUrls[peek.id] ? (
              <PinnedPhoto src={photoUrls[peek.id]!} x={peek.pinX} y={peek.pinY} className="max-h-64" />
            ) : (
              <Loader2 className="size-5 animate-spin" />
            )}
            {peek.landmark ? <p className="mt-2 text-xs text-muted-foreground">{peek.landmark}</p> : null}
          </div>
        ) : null}
      </div>

      <div className="border-t border-wa-divider bg-card px-4 py-3">
        {/* Walk navigation hidden from the public until footpaths are reliable; drive is the default. */}
        {SHOW_WALK ? (
          <div className="mb-2 flex gap-1">
            {(["walk", "drive"] as TravelMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={`flex-1 rounded-full px-3 py-1 text-xs font-medium ${mode === m ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              >
                {m === "walk" ? "🚶 Walk" : "🚗 Drive"}
              </button>
            ))}
          </div>
        ) : null}
        {nearCard && destPhoto ? (
          <div className="mb-3 rounded-2xl border border-wa-green/40 bg-wa-panel p-2">
            <p className="mb-2 text-sm font-semibold text-wa-green">
              {arrived ? "You are outside" : "Look for this doorstep"} · {destPhoto.name}
            </p>
            {photoUrls[destPhoto.id] ? (
              <PinnedPhoto src={photoUrls[destPhoto.id]!} x={destPhoto.pinX} y={destPhoto.pinY} pulse className="max-h-72" />
            ) : (
              <Loader2 className="size-5 animate-spin" />
            )}
            {destPhoto.landmark ? <p className="mt-2 text-xs">{destPhoto.landmark}</p> : null}
          </div>
        ) : null}
        {!me ? (
          <p className="flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" /> Finding your position…
          </p>
        ) : arrived ? (
          <p className="text-base font-semibold text-wa-green">🎉 You have arrived at {target.label || "the destination"}</p>
        ) : (
          <>
            <p className="text-2xl font-bold">{fmt(dist!)}</p>
            <p className="text-sm text-muted-foreground">
              About {etaMin} min · Head {dir} · GPS ±{Math.round(me.acc)}m
            </p>
          </>
        )}
        {me && !arrived ? (
          <p className="mt-1 text-xs text-wa-green">
            {road
              ? road.source === "osrm"
                ? mode === "drive"
                  ? "Following public car roads"
                  : "Following public walking roads"
                : road.source === "ai"
                  ? road.verified
                    ? "Following a FindMit suggested footpath confirmed by walkers"
                    : "FindMit suggested footpath - not yet confirmed by walkers. Please rate it at the end."
                  : road.verified
                ? `Following road verified by ${road.builderName || "a FindMit volunteer"}`
                : `Following community road recorded by ${road.builderName || "a FindMit volunteer"} (awaiting confirmation)`
              : "No road found yet - showing the direct line. Record it in Learn a Road!"}
          </p>
        ) : null}
        {askFeedback && road && user && !feedbackDone ? (
          <RoadFeedback
            routeId={road.id}
            userId={user.id}
            isAi={road.source === "ai"}
            here={me}
            onDone={() => {
              setFeedbackDone(true);
              setAskFeedback(false);
            }}
          />
        ) : null}
        {target.landmark ? (
          <p className="mt-1 flex items-center gap-1 text-xs">
            <MapPin className="size-3.5 text-wa-green" /> {target.landmark}
          </p>
        ) : null}
      </div>
    </div>
  );
}
