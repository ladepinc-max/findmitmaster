/** Splits Ama's answers into text, chalkboard diagrams and textbook pictures. */

export type TeacherPart =
  | { kind: "text"; text: string }
  | { kind: "diagram"; caption: string; svg: string }
  | { kind: "picture"; description: string };

const BLOCK =
  /\[DIAGRAM(?::\s*([^\]]*))?\]\s*([\s\S]*?)\s*\[\/DIAGRAM\]|\[PICTURE:\s*([^\]]+)\]|(<svg[\s\S]*?<\/svg>)/gi;

export function splitTeacherParts(input: string): TeacherPart[] {
  const parts: TeacherPart[] = [];
  let last = 0;
  for (const m of input.matchAll(BLOCK)) {
    const idx = m.index ?? 0;
    if (idx > last) parts.push({ kind: "text", text: input.slice(last, idx) });
    if (m[3]) parts.push({ kind: "picture", description: m[3].trim() });
    else {
      const svg = (m[2] ?? m[4] ?? "").match(/<svg[\s\S]*?<\/svg>/i)?.[0];
      if (svg) parts.push({ kind: "diagram", caption: (m[1] ?? "").trim(), svg });
    }
    last = idx + m[0].length;
  }
  if (last < input.length) parts.push({ kind: "text", text: input.slice(last) });
  return parts;
}

/** Removes diagram markup so it is never read aloud or resent to the tutor. */
export function stripDiagrams(input: string, replacement = " Look at the diagram on the board. ") {
  return input.replace(BLOCK, (_m, _c, _s, pic: string | undefined) =>
    pic ? " Look at the picture. " : replacement,
  );
}

const ALLOWED = new Set([
  "svg", "g", "line", "rect", "circle", "ellipse", "polygon", "polyline", "path",
  "text", "tspan", "defs", "marker", "title",
]);

/** Keeps only safe drawing elements; returns null if the svg is unusable. Browser only. */
export function sanitizeSvg(svg: string): string | null {
  if (typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) return null;
  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      if (!ALLOWED.has(child.nodeName.toLowerCase())) {
        child.remove();
        continue;
      }
      walk(child);
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.toLowerCase();
      if (
        name.startsWith("on") ||
        name === "style" ||
        ((name === "href" || name === "xlink:href") && !value.startsWith("#")) ||
        value.includes("javascript:") ||
        (value.includes("url(") && !value.includes("url(#"))
      ) {
        el.removeAttribute(attr.name);
      }
    }
  };
  walk(root);
  root.removeAttribute("width");
  root.removeAttribute("height");
  if (!root.getAttribute("viewBox")) root.setAttribute("viewBox", "0 0 320 220");
  root.setAttribute("width", "100%");
  return new XMLSerializer().serializeToString(root);
}
