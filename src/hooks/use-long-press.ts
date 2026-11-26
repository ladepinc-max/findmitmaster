import { useRef } from "react";

/** Fires onLongPress after holding ~600ms; suppresses the following click so links don't open. */
export function useLongPress(enabled: boolean) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  return (onLongPress: () => void) => {
    if (!enabled) return {};
    const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
    return {
      onPointerDown: () => { fired.current = false; clear(); timer.current = setTimeout(() => { fired.current = true; onLongPress(); }, 600); },
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
      onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
      onClickCapture: (e: { preventDefault: () => void; stopPropagation: () => void }) => { if (fired.current) { e.preventDefault(); e.stopPropagation(); fired.current = false; } },
    };
  };
}
