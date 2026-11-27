import { googleIndexingEnabled } from "./publication";

/** Read only public settings; never substitute privileged credentials. */
export async function readGooglePublication(): Promise<boolean> {
  const url = process.env['SUPABASE_URL'] ?? import.meta.env['VITE_SUPABASE_URL'];
  const key = process.env['SUPABASE_PUBLISHABLE_KEY'] ?? import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !key) return false;
  try {
    const response = await fetch(`${url}/rest/v1/publication_settings?select=google_indexing_enabled&id=eq.true`, {
      headers: { apikey: key }, cache: "no-store", signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const rows = await response.json() as { google_indexing_enabled?: boolean }[];
    return googleIndexingEnabled(rows[0]);
  } catch { return false; }
}