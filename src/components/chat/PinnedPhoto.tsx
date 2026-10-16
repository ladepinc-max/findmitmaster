import { useRef } from "react";

/** Green arrow drawn on a photo at x/y (0..1). */
function Arrow({ x, y, pulse }: { x: number; y: number; pulse?: boolean | undefined }) {
  return (
    <div
      className="pointer-events-none absolute -translate-x-1/2 -translate-y-full"
      style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
    >
      {pulse ? (
        <span className="absolute left-1/2 top-full size-8 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-wa-green/60" />
      ) : null}
      <svg width="34" height="44" viewBox="0 0 34 44" className="relative drop-shadow-lg">
        <path
          d="M17 43 L3 20 Q0 14 4 9 Q10 1 17 1 Q24 1 30 9 Q34 14 31 20 Z"
          className="fill-wa-green stroke-background"
          strokeWidth="3"
        />
        <path d="M17 10 L24 20 H20 V28 H14 V20 H10 Z" className="fill-background" />
      </svg>
    </div>
  );
}

/** Shows a photo with its pinned arrow (read-only). */
export function PinnedPhoto({
  src,
  x,
  y,
  pulse,
  className = "",
}: {
  src: string;
  x: number | null;
  y: number | null;
  pulse?: boolean | undefined;
  className?: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-xl ${className}`}>
      <img src={src} alt="Doorstep" className="block w-full object-cover" />
      {x != null && y != null ? <Arrow x={x} y={y} pulse={pulse} /> : null}
    </div>
  );
}

/** Tap (or drag) on the photo to drop the arrow where you stood / the door. */
export function PhotoPinner({
  src,
  value,
  onChange,
}: {
  src: string;
  value: { x: number; y: number } | null;
  onChange: (v: { x: number; y: number }) => void;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  const place = (cx: number, cy: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    onChange({
      x: Math.min(1, Math.max(0, (cx - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (cy - r.top) / r.height)),
    });
  };
  return (
    <div>
      <p className="mt-3 text-xs font-medium text-wa-green">
        {value ? "Arrow placed - drag or tap again to adjust." : "Tap on the photo where you stood / the door."}
      </p>
      <div
        ref={box}
        className="relative mt-2 touch-none select-none overflow-hidden rounded-xl"
        onPointerDown={(e) => {
          dragging.current = true;
          place(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => dragging.current && place(e.clientX, e.clientY)}
        onPointerUp={() => (dragging.current = false)}
        onPointerLeave={() => (dragging.current = false)}
      >
        <img src={src} alt="Start point" draggable={false} className="block w-full object-cover" />
        {value ? <Arrow x={value.x} y={value.y} /> : null}
      </div>
    </div>
  );
}
