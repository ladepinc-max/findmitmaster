/** Server-only GES vault retrieval. Never imported from client code. */


export interface VaultChunk {
  id: string;
  subject: string;
  grade: string;
  strand: string | null;
  sub_strand: string | null;
  indicator: string | null;
  content: string;
  source_text: string | null;
  source_type: string;
  similarity: number;
}

export interface VaultRowLike {
  subject: string;
  grade: string;
  strand?: string | null | undefined;
  sub_strand?: string | null | undefined;
  indicator?: string | null | undefined;
  content: string;
}

/** Turns text into the number list the vault search uses to find close matches. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const { geminiEmbed } = await import("@/lib/gemini.server");
  return geminiEmbed(texts);
}

export function rowText(r: VaultRowLike) {
  return `${r.indicator ?? ""} ${r.strand ?? ""} ${r.sub_strand ?? ""} | ${r.subject} ${r.grade} | ${r.content}`;
}

/** The only information source Ama may use for JHS students. */
export async function searchVault(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  question: string,
  opts?: { grade?: string | null; subject?: string | null; count?: number },
): Promise<VaultChunk[]> {
  let embedding: number[] | null = null;
  try {
    embedding = (await embedTexts([question]))[0] ?? null;
  } catch {
    embedding = null;
  }
  const { data, error } = await supabase.rpc("match_vault", {
    query_embedding: embedding ? JSON.stringify(embedding) : null,
    query_text: question,
    match_level: "jhs",
    match_grade: opts?.grade ?? null,
    match_count: opts?.count ?? 3,
  });
  if (error) return [];
  return ((data ?? []) as VaultChunk[]).filter((c) => (c.similarity ?? 0) > 0);
}

/** Formats vault chunks as the grounding block placed in Ama's prompt. */
export function vaultContext(chunks: VaultChunk[]) {
  if (chunks.length === 0) return "";
  return chunks
    .map(
      (c, i) =>
        `[${i + 1}] ${c.subject} ${c.grade} — ${c.strand ?? ""}${c.sub_strand ? " / " + c.sub_strand : ""}\nIndicator ${c.indicator ?? "-"}: ${c.content}${c.source_text ? `\nSource: ${c.source_text}` : ""}`,
    )
    .join("\n\n");
}
