import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";


/** Turns text into the number list the vault search uses to find close matches. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const { geminiEmbed } = await import("@/lib/gemini.server");
  return geminiEmbed(texts);
}

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

/** Rows of the vault, embedded so a question can find the matching syllabus work. */
function rowText(r: {
  subject: string;
  grade: string;
  strand?: string | null | undefined;
  sub_strand?: string | null | undefined;
  indicator?: string | null | undefined;
  content: string;
}) {
  return `${r.indicator ?? ""} ${r.strand ?? ""} ${r.sub_strand ?? ""} | ${r.subject} ${r.grade} | ${r.content}`;
}

/** The only information source Ama may use for JHS students. */
export async function searchVault(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  question: string,
  opts?: { grade?: string | null; subject?: string | null; count?: number; level?: string | null },
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
    match_level: vaultLevelFor(opts?.level ?? "jhs"),
    match_grade: opts?.grade ?? null,
    match_count: opts?.count ?? 3,
  });
  if (error) return [];
  return ((data ?? []) as VaultChunk[]).filter((c) => c.similarity > 0);
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

/** Tutor class ids map onto the five vault sections. */
export function vaultLevelFor(level: string) {
  if (level === "primary") return "basic";
  if (level === "others") return "tertiary";
  return ["kids", "basic", "jhs", "shs", "tertiary"].includes(level) ? level : "jhs";
}

/** Optional textbook guidance for classes other than JHS (JHS stays strictly vault-only). */
export async function vaultGuidance(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  level: string | undefined,
  question: string,
  grade?: string | null,
) {
  if (!level) return "";
  const chunks = await searchVault(supabase, question, { level, grade: grade ?? null, count: 3 }).catch(() => []);
  if (chunks.length === 0) return "";
  return `\n\nOFFICIAL FINDMIT VAULT (Ghana textbook and past question material for this class). Teach with the same methods, words and marking style as this material, and make any new examples follow the same pattern:\n${vaultContext(chunks)}`;
}

const EntrySchema = z.object({
  level: z.enum(["kids", "basic", "jhs", "shs", "tertiary"]).default("jhs"),
  subject: z.string().min(2).max(80),
  grade: z.string().min(2).max(12),
  strand: z.preprocess((v) => (typeof v === "string" ? v.slice(0, 200) : v), z.string().max(200).optional().nullable()),
  sub_strand: z.preprocess((v) => (typeof v === "string" ? v.slice(0, 200) : v), z.string().max(200).optional().nullable()),
  indicator: z.preprocess((v) => (typeof v === "string" ? v.slice(0, 120) : v), z.string().max(120).optional().nullable()),
  content: z.string().min(3).max(8000),
  source_text: z.string().max(2000).optional().nullable(),
  source_type: z.enum(["syllabus", "bece_past_question", "textbook", "past_question"]).default("syllabus"),
});

export type VaultEntry = z.infer<typeof EntrySchema>;

async function assertAdmin(context: { supabase: unknown; userId: string; claims?: unknown }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = context.supabase as any;
  const { data } = await sb.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  const email = String((context.claims as { email?: string } | undefined)?.email ?? "").toLowerCase();
  if (data !== true && email !== "findmitedutech@gmail.com") throw new Error("Forbidden");
}

/** Adds syllabus rows, BECE past questions or textbook notes to the vault. */
export const addVaultEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ entries: z.array(EntrySchema).min(1).max(500) }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    // New rows stay unpublished (invisible to Ama) until the admin taps "Update AI tutor".
    const rows = data.entries.map((e) => ({
      ...e,
      created_by: context.userId,
      embedding: null,
      published: false,
    }));
    const { error } = await sb.from("ges_vault_jhs").insert(rows);
    if (error) throw new Error(error.message);
    return { added: rows.length, indexed: 0 };
  });

/** Publishes pending vault rows: embeds them so Ama can find and use them. */
export const indexVault = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ limit: z.number().int().min(1).max(500).default(60) }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: rows, error } = await sb
      .from("ges_vault_jhs")
      .select("id, subject, grade, strand, sub_strand, indicator, content")
      .eq("published", false)
      .limit(data.limit);
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as (VaultEntry & { id: string })[];
    if (list.length === 0) return { indexed: 0, remaining: 0 };
    let embeddings: number[][] | null = null;
    if (process.env["GEMINI_API_KEY"]) {
      embeddings = await embedTexts(list.map((r) => rowText(r))).catch(() => null);
    }
    if (embeddings) {
      for (let i = 0; i < list.length; i++) {
        await sb
          .from("ges_vault_jhs")
          .update({ embedding: JSON.stringify(embeddings[i]), published: true })
          .eq("id", list[i]!.id);
      }
    } else {
      // No embedding key: publish directly; Ama finds these through the built-in text search.
      const { error: upErr } = await sb
        .from("ges_vault_jhs")
        .update({ published: true })
        .in("id", list.map((r) => r.id));
      if (upErr) throw new Error(upErr.message);
    }
    const { count } = await sb
      .from("ges_vault_jhs")
      .select("id", { count: "exact", head: true })
      .eq("published", false);
    return { indexed: list.length, remaining: count ?? 0 };
  });

/** Admin preview: what Ama would actually read for a given question. */
export const previewVaultSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        question: z.string().min(2).max(500),
        grade: z.string().optional().nullable(),
        subject: z.string().optional().nullable(),
        level: z.string().optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const chunks = await searchVault(context.supabase, data.question, {
      grade: data.grade || null,
      subject: data.subject || null,
      level: data.level || "jhs",
      count: 3,
    });
    return { chunks };
  });
