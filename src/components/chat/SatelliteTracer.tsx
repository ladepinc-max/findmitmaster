import { useEffect, useState } from "react";
import { Loader2, PenLine, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CommunityMapView } from "@/components/chat/CommunityMapView";
import { saveTracedPath, type PathType } from "@/lib/community-map";

const TYPES: [PathType, string][] = [
  ["footpath", "Footpath (walk only)"],
  ["dirt", "Dirt / rough road"],
  ["paved", "Tarred road"],
];

/** Volunteers tap along a path they can see on the satellite map to add it as a FindMit road. */
export function SatelliteTracer({ userId, builderName }: { userId: string; builderName: string }) {
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [points, setPoints] = useState<[number, number][]>([]);
  const [pathType, setPathType] = useState<PathType>("footpath");
  const [motorable, setMotorable] = useState(false);
  const [localName, setLocalName] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || center) return;
    navigator.geolocation?.getCurrentPosition(
      (p) => setCenter({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setCenter({ lat: 5.6037, lng: -0.187 }),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [open, center]);

  const save = async () => {
    setSaving(true);
    try {
      await saveTracedPath({ userId, builderName, points, pathType, motorable, localName, note });
      toast.success("Path saved! It is now usable and waiting for walkers to confirm.");
      setPoints([]);
      setLocalName("");
      setNote("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save path");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl bg-card p-4 shadow-sm">
      <p className="text-sm font-semibold">Trace a path on satellite</p>
      <p className="mt-1 text-xs text-muted-foreground">
        See a footpath or dirt road on the satellite picture? Tap along it, point by point, from start to end.
      </p>
      {!open ? (
        <Button className="mt-3 w-full" variant="outline" onClick={() => setOpen(true)}>
          <PenLine className="size-4" /> Start tracing
        </Button>
      ) : !center ? (
        <Loader2 className="mt-3 size-5 animate-spin" />
      ) : (
        <div className="mt-3 space-y-3">
          <CommunityMapView
            center={center}
            roads={[{ id: "draft", points, verified: false, pending: true }]}
            places={points.map((p, i) => ({ id: `p${i}`, lat: p[0], lng: p[1], label: `Point ${i + 1}`, verified: i === 0 }))}
            onMapTap={(lat, lng) => setPoints((p) => [...p, [lat, lng]])}
            height={320}
          />
          <div className="flex items-center gap-2 text-xs">
            <span className="flex-1">{points.length} points tapped</span>
            <Button size="sm" variant="ghost" disabled={!points.length} onClick={() => setPoints((p) => p.slice(0, -1))}>
              <Undo2 className="size-4" /> Undo
            </Button>
            <Button size="sm" variant="ghost" disabled={!points.length} onClick={() => setPoints([])}>
              Clear
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TYPES.map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setPathType(k)}
                className={`rounded-full px-3 py-1 text-xs ${pathType === k ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {pathType === "dirt" ? (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={motorable} onChange={(e) => setMotorable(e.target.checked)} />
              Cars can drive on this road
            </label>
          ) : null}
          <Input value={localName} onChange={(e) => setLocalName(e.target.value)} placeholder="Local name (optional)" maxLength={80} />
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Access notes e.g. gate closes at 9pm" maxLength={200} />
          <Button className="w-full" disabled={points.length < 2 || saving} onClick={() => void save()}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null} Save traced path
          </Button>
        </div>
      )}
    </div>
  );
}
