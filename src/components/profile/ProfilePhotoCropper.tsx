import { useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

type Props = {
  file: File | null;
  onClose: () => void;
  onApply: (file: File) => void;
};

async function cropPhoto(source: string, area: Area): Promise<File> {
  const image = new Image();
  image.src = source;
  await image.decode();

  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 768;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Photo editor unavailable");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, 768, 768);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not crop photo")), "image/jpeg", 0.9);
  });
  return new File([blob], "profile-photo.jpg", { type: "image/jpeg" });
}

export function ProfilePhotoCropper({ file, onClose, onApply }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!file) return;
    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setArea(null);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  const apply = async () => {
    if (!url || !area || working) return;
    setWorking(true);
    try {
      onApply(await cropPhoto(url, area));
      onClose();
    } catch (error) {
      console.error(error);
      toast.error("Could not crop this photo. Please choose another image.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open={Boolean(file)} onOpenChange={(open) => { if (!open && !working) onClose(); }}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md gap-5 rounded-md p-4 sm:p-6">
        <DialogHeader><DialogTitle>Edit profile photo</DialogTitle></DialogHeader>
        <div className="relative mx-auto aspect-square w-full max-w-[min(100%,360px)] overflow-hidden bg-muted" aria-label="Move or pinch the photo to position it">
          {url && <Cropper
            image={url}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, pixels) => setArea(pixels)}
          />}
        </div>
        <div className="space-y-3">
          <label htmlFor="photo-zoom" className="text-sm font-medium">Zoom</label>
          <Slider id="photo-zoom" aria-label="Photo zoom" min={1} max={3} step={0.01} value={[zoom]} onValueChange={([value]) => { if (value !== undefined) setZoom(value); }} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={working}>Cancel</Button>
          <Button type="button" onClick={() => void apply()} disabled={!area || working}>{working ? "Cropping…" : "Use photo"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}