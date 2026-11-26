/** True when response headers forbid showing the page inside another site's frame. */
export function frameBlockedByHeaders(xfo: string | null, csp: string | null): boolean {
  const x = (xfo ?? "").toLowerCase();
  if (x.includes("deny") || x.includes("sameorigin")) return true;
  const fa = (csp ?? "").toLowerCase().split(";").map((s) => s.trim()).find((s) => s.startsWith("frame-ancestors"));
  if (!fa) return false;
  const srcs = fa.split(/\s+/).slice(1);
  if (srcs.includes("*")) return false;
  return !srcs.some((s) => s.includes("findmit"));
}
