/** Missing or unreadable publication settings always keep trials out of search. */
export function googleIndexingEnabled(settings: { google_indexing_enabled?: boolean } | null | undefined): boolean {
  return settings?.google_indexing_enabled === true;
}