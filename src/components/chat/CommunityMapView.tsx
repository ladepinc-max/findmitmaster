import { useEffect, useRef } from "react";
import type * as L from "leaflet";

export interface MapPlace {
  id: string;
  lat: number;
  lng: number;
  label: string;
  verified: boolean;
  photo?: boolean;
}

export interface MapShop {
  id: string;
  lat: number;
  lng: number;
  name: string;
  emoji: string;
}

export interface MapRoad {
  id: string;
  points: [number, number][];
  verified: boolean;
  pending?: boolean;
}

/**
 * Satellite map (free Esri imagery, no key). Leaflet is loaded only in the browser.
 * When onPinMove is given, shows a draggable pin for exact-building placement.
 */
export function CommunityMapView({
  center,
  pin,
  onPinMove,
  places = [],
  roads = [],
  height = 260,
  onMapTap,
  shops = [],
  onShopTap,
  me,
  follow,
  rotate,
  onUserDrag,
}: {
  center: { lat: number; lng: number };
  pin?: { lat: number; lng: number } | null;
  onPinMove?: (lat: number, lng: number) => void;
  places?: MapPlace[];
  roads?: MapRoad[];
  height?: number;
  onMapTap?: (lat: number, lng: number) => void;
  shops?: MapShop[];
  onShopTap?: (id: string) => void;
  /** Live user marker with heading arrow. */
  me?: { lat: number; lng: number; heading?: number | null } | null;
  /** When set, the camera keeps panning to this point. */
  follow?: { lat: number; lng: number } | null;
  /** Heading-up: rotates the map so this bearing points up. */
  rotate?: number;
  onUserDrag?: () => void;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const libRef = useRef<typeof L | null>(null);
  const pinRef = useRef<L.Marker | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const moveRef = useRef(onPinMove);
  moveRef.current = onPinMove;
  const tapRef = useRef(onMapTap);
  tapRef.current = onMapTap;
  const shopTapRef = useRef(onShopTap);
  shopTapRef.current = onShopTap;
  const dragRef = useRef(onUserDrag);
  dragRef.current = onUserDrag;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const lib = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !boxRef.current || mapRef.current) return;
      libRef.current = lib;
      const map = lib.map(boxRef.current, { zoomControl: true }).setView([center.lat, center.lng], 18);
      const sat = lib.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 19, attribution: "Imagery © Esri" },
      );
      const streets = lib.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      });
      sat.addTo(map);
      lib.control.layers({ Satellite: sat, Streets: streets }).addTo(map);
      layerRef.current = lib.layerGroup().addTo(map);
      mapRef.current = map;
      map.on("click", (e: L.LeafletMouseEvent) => tapRef.current?.(e.latlng.lat, e.latlng.lng));
      draw();
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      pinRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw() {
    const lib = libRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!lib || !map || !layer) return;
    layer.clearLayers();
    for (const r of roads) {
      if (r.points.length < 2) continue;
      lib
        .polyline(r.points, {
          color: r.pending ? "#f59e0b" : r.verified ? "#16a34a" : "#9ca3af",
          weight: 5,
          opacity: 0.9,
          ...(r.pending ? { dashArray: "10 8" } : {}),
        })
        .addTo(layer);
    }
    for (const p of places) {
      lib
        .circleMarker([p.lat, p.lng], {
          radius: p.photo ? 6 : 7,
          color: p.photo ? "#f59e0b" : "#ffffff",
          weight: p.photo ? 3 : 2,
          fillColor: p.photo ? "#ffffff" : p.verified ? "#16a34a" : "#9ca3af",
          fillOpacity: 1,
        })
        .bindTooltip(p.photo ? `📷 ${p.label}` : p.label)
        .addTo(layer);
    }
    for (const s of shops) {
      const icon = lib.divIcon({
        className: "",
        html: `<div style="width:34px;height:34px;border-radius:50%;background:#fff;border:2px solid #16a34a;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 2px 6px rgba(0,0,0,.35)">${s.emoji}</div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });
      lib
        .marker([s.lat, s.lng], { icon })
        .bindTooltip(s.name.replace(/[<>&]/g, ""))
        .on("click", () => shopTapRef.current?.(s.id))
        .addTo(layer);
    }
    if (pin) {
      if (!pinRef.current) {
        const icon = lib.divIcon({
          className: "",
          html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#dc2626;border:3px solid #fff;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>',
          iconSize: [22, 22],
          iconAnchor: [11, 22],
        });
        pinRef.current = lib.marker([pin.lat, pin.lng], { draggable: Boolean(moveRef.current), icon }).addTo(map);
        pinRef.current.on("dragend", () => {
          const ll = pinRef.current!.getLatLng();
          moveRef.current?.(ll.lat, ll.lng);
        });
        if (moveRef.current) map.setView([pin.lat, pin.lng], 18);
      } else {
        pinRef.current.setLatLng([pin.lat, pin.lng]);
      }
    } else if (pinRef.current) {
      pinRef.current.remove();
      pinRef.current = null;
    }
    if (me) {
      const icon = lib.divIcon({
        className: "",
        html: `<div style="position:relative;width:44px;height:44px"><div style="position:absolute;inset:0;border-radius:50%;background:rgba(37,99,235,.25);animation:fmPulse 1.6s ease-out infinite"></div><div style="position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div><div style="position:absolute;left:50%;top:-6px;margin-left:-8px;width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-bottom:14px solid #2563eb;transform-origin:8px 28px;transform:rotate(${me.heading ?? 0}deg)"></div></div><style>@keyframes fmPulse{0%{transform:scale(.6);opacity:1}100%{transform:scale(1.6);opacity:0}}</style>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });
      lib.marker([me.lat, me.lng], { icon, interactive: false, zIndexOffset: 1000 }).addTo(layer);
    }
  }

  useEffect(draw, [pin?.lat, pin?.lng, places, roads, shops, me?.lat, me?.lng, me?.heading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Follow mode: keep the camera on the user as they move.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !follow) return;
    map.panTo([follow.lat, follow.lng], { animate: true, duration: 0.8 });
  }, [follow?.lat, follow?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const stop = () => dragRef.current?.();
    map.on("dragstart", stop);
    return () => {
      map.off("dragstart", stop);
    };
  });

  const rot = rotate ?? 0;
  return (
    <div style={{ height }} className="relative z-0 w-full overflow-hidden rounded-xl border border-border bg-muted">
      <div
        ref={boxRef}
        style={
          rotate === undefined
            ? { height: "100%", width: "100%" }
            : {
                position: "absolute",
                width: "150%",
                height: "150%",
                left: "-25%",
                top: "-25%",
                transform: `rotate(${-rot}deg)`,
                transition: "transform 0.8s ease-out",
              }
        }
      />
    </div>
  );
}
