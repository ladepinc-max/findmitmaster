/** Guest-readable screens; private tools retain the existing account gate. */
export function isPublicBrowsingPath(pathname: string): boolean {
  return ["/home", "/jobs", "/shops"].includes(pathname) ||
    ["/community-news/", "/ad/", "/job/", "/supplier/", "/@"].some((prefix) => pathname.startsWith(prefix));
}