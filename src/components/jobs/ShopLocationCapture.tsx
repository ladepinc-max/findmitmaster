import { useState } from "react";
import { Camera, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { InAppCamera } from "@/components/chat/InAppCamera";
import { Button } from "@/components/ui/button";
import { captureAccurateLocation } from "@/lib/community-map";

export interface ShopCapture {
  lat: number;
  lng: number;
  accuracy: number;
}

/** Workplace capture for job posts: exact GPS pin + a photo of the shop front. */
export function ShopLocationCapture({
  coords,
  onCoords,
  photo,
  onPhoto,
}: {
  coords: ShopCapture | null;
  onCoords: (c: ShopCapture) => void;
  photo: Blob | null;
  onPhoto: (b: Blob | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const preview = photo ? URL.createObjectURL(photo) : null;

  const capture = async () => {
    setBusy(true);
    const result = await captureAccurateLocation();
    setBusy(false);
    if (result.quality === "blocked" && result.point.accuracy > 100) {
      toast.error(result.message);
      return;
    }
    onCoords({ lat: result.point.lat, lng: result.point.lng, accuracy: result.point.accuracy });
    toast.success(`Location captured (±${Math.round(result.point.accuracy)}m)`);
  };

  const pickFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) onPhoto(f);
    };
    input.click();
  };

  return (
    <div className="space-y-2 rounded-2xl border border-border bg-secondary/40 p-3">
      <Button type="button" variant="secondary" className="w-full rounded-full" onClick={() => void capture()} disabled={busy}>
        {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <MapPin className="mr-2 size-4" />}
        {coords ? "Recapture shop location" : "Capture shop location on map *"}
      </Button>
      {coords ? (
        <div className="overflow-hidden rounded-xl">
          <iframe
            title="Shop location"
            className="h-32 w-full border-0"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${coords.lng - 0.003},${coords.lat - 0.002},${coords.lng + 0.003},${coords.lat + 0.002}&layer=mapnik&marker=${coords.lat},${coords.lng}`}
          />
          <p className="pt-1 text-xs text-muted-foreground">
            Pin: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
          </p>
        </div>
      ) : null}
      {preview ? (
        <div className="relative">
          <img src={preview} alt="Shop front" className="h-40 w-full rounded-xl object-cover" />
          <Button type="button" size="sm" variant="secondary" className="absolute right-2 top-2 rounded-full" onClick={() => setCamera(true)}>
            Retake
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" className="w-full rounded-full" onClick={() => setCamera(true)}>
          <Camera className="mr-2 size-4" /> Take a picture of the shop *
        </Button>
      )}
      <p className="text-[11px] text-muted-foreground">
        Job seekers see this photo and location to check the shop is genuine and get directions.
      </p>
      {camera ? (
        <InAppCamera
          onShot={(b) => {
            onPhoto(b);
            setCamera(false);
          }}
          onClose={() => setCamera(false)}
          onFallback={() => {
            setCamera(false);
            pickFile();
          }}
        />
      ) : null}
    </div>
  );
}
