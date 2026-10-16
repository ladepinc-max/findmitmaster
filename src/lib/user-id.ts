import { toast } from "sonner";

/** Public FindMit ID shown to other users — short, stable and easy to read aloud. */
export function findmitId(userId: string | null | undefined) {
  if (!userId) return "";
  return `FM-${userId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

/** Copy any FindMit ID to the clipboard with a confirmation toast. */
export async function copyFindmitId(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success("User ID copied");
  } catch {
    toast.error("Could not copy the ID");
  }
}
