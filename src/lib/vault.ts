import { supabase } from "@/integrations/supabase/client";
import type { VaultEntry } from "@/lib/vault.functions";

/** Loose query helper: the vault table is newer than the generated types. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (t: string) => (supabase as unknown as { from: (t: string) => any }).from(t);

export const VAULT_GRADES = ["B7", "B8", "B9"] as const;

/** The nine JHS subjects the GES vault covers. */
export const VAULT_SUBJECTS = [
  "Mathematics",
  "English Language",
  "Science",
  "Social Studies",
  "Computing",
  "Career Technology",
  "RME",
  "Creative Arts and Design",
  "Physical Education and Health",
];

export type VaultLevelId = "kids" | "basic" | "jhs" | "shs" | "tertiary";

export interface VaultLevel {
  id: VaultLevelId;
  label: string;
  classes: { id: string; label: string }[];
  subjects: string[];
  pastLabel: string;
}

/** The five vault sections the admin picks from. */
export const VAULT_LEVELS: VaultLevel[] = [
  {
    id: "kids",
    label: "KIDS (KG 1 – 2)",
    classes: [
      { id: "KG1", label: "KG 1" },
      { id: "KG2", label: "KG 2" },
    ],
    subjects: ["Language and Literacy", "Numeracy", "Creative Arts", "Our World Our People", "Physical Development"],
    pastLabel: "Past questions",
  },
  {
    id: "basic",
    label: "BASIC (Class 1 – 6)",
    classes: ["B1", "B2", "B3", "B4", "B5", "B6"].map((g, i) => ({ id: g, label: `Class ${i + 1}` })),
    subjects: ["Mathematics", "English Language", "Science", "Our World Our People", "Ghanaian Language", "RME", "Creative Arts", "Computing", "Physical Education", "French"],
    pastLabel: "Past questions",
  },
  {
    id: "jhs",
    label: "JHS (Class 7 – 9)",
    classes: [
      { id: "B7", label: "B7 (JHS 1)" },
      { id: "B8", label: "B8 (JHS 2)" },
      { id: "B9", label: "B9 (JHS 3)" },
    ],
    subjects: [
      "Mathematics",
      "English Language",
      "Science",
      "Social Studies",
      "Computing",
      "Career Technology",
      "RME",
      "Creative Arts and Design",
      "Physical Education and Health",
      "Ghanaian Language",
      "French",
    ],
    pastLabel: "BECE past questions",
  },
  {
    id: "shs",
    label: "SHS (Class 1 – 3)",
    classes: [
      { id: "SHS1", label: "SHS 1" },
      { id: "SHS2", label: "SHS 2" },
      { id: "SHS3", label: "SHS 3" },
    ],
    subjects: ["Core Mathematics", "English Language", "Integrated Science", "Social Studies", "Elective Mathematics", "Physics", "Chemistry", "Biology", "Economics", "Geography", "Government", "History", "Literature in English", "Business Management", "Financial Accounting", "ICT"],
    pastLabel: "WASSCE past questions",
  },
  {
    id: "tertiary",
    label: "TERTIARY",
    classes: [
      { id: "Y1", label: "Year 1" },
      { id: "Y2", label: "Year 2" },
      { id: "Y3", label: "Year 3" },
      { id: "Y4", label: "Year 4" },
    ],
    subjects: ["Nursing", "Midwifery", "Teacher Training", "Business", "Engineering", "Law", "Medicine", "General Studies"],
    pastLabel: "Licensing / exam questions",
  },
];

export const VAULT_SOURCE_TYPES = [
  { id: "syllabus", label: "Syllabus indicator" },
  { id: "bece_past_question", label: "BECE past question" },
  { id: "textbook", label: "Textbook note" },
] as const;

export interface VaultStatRow {
  subject: string;
  grade: string;
  source_type: string;
  indexed: boolean;
}

export interface VaultSummary {
  total: number;
  indexed: number;
  bySubject: { subject: string; count: number }[];
  byGrade: { grade: string; count: number }[];
  byType: { type: string; count: number }[];
}

export async function fetchVaultSummary(level: VaultLevelId = "jhs"): Promise<VaultSummary> {
  const { data } = await db("ges_vault_jhs")
    .select("subject, grade, source_type, published")
    .eq("level", level)
    .limit(20000);
  const rows = ((data ?? []) as { subject: string; grade: string; source_type: string; published: unknown }[]).map(
    (r) => ({ ...r, indexed: r.published === true }),
  );
  const tally = (key: "subject" | "grade" | "source_type") => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r[key], (map.get(r[key]) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  };
  return {
    total: rows.length,
    indexed: rows.filter((r) => r.indexed).length,
    bySubject: tally("subject").map(([subject, count]) => ({ subject, count })),
    byGrade: tally("grade")
      .map(([grade, count]) => ({ grade, count }))
      .sort((a, b) => a.grade.localeCompare(b.grade)),
    byType: tally("source_type").map(([type, count]) => ({ type, count })),
  };
}

type Loose = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function gradeOf(record: Loose): "B7" | "B8" | "B9" | null {
  const raw = (str(record["gradeCode"]) || str(record["grade"]) || str(record["indicatorCode"]) || "").toUpperCase();
  const hit = raw.match(/B[789]/);
  return hit ? (hit[0] as "B7" | "B8" | "B9") : null;
}

/**
 * Reads an uploaded curriculum file into vault rows.
 * Accepts the NaCCA extraction envelope ({ manifest, records: [...] }),
 * a plain array of records, or a simple list of { subject, grade, content }.
 */
export function parseCurriculumFile(text: string): { entries: VaultEntry[]; skipped: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file is not a readable curriculum file.");
  }
  const list: Loose[] = Array.isArray(parsed)
    ? (parsed as Loose[])
    : Array.isArray((parsed as Loose)["records"])
      ? ((parsed as Loose)["records"] as Loose[])
      : Array.isArray((parsed as Loose)["entries"])
        ? ((parsed as Loose)["entries"] as Loose[])
        : [];
  if (list.length === 0) throw new Error("No curriculum entries were found in that file.");

  const entries: VaultEntry[] = [];
  let skipped = 0;
  for (const record of list) {
    const grade = gradeOf(record);
    const subject = str(record["subjectName"]) || str(record["subject"]) || str(record["subjectSlug"]);
    const indicatorText = str(record["indicatorText"]) || str(record["content"]) || str(record["text"]);
    if (!grade || !subject || !indicatorText) {
      skipped++;
      continue;
    }
    const exemplars = Array.isArray(record["exemplars"])
      ? (record["exemplars"] as Loose[])
          .map((e) => str(e["text"]))
          .filter(Boolean)
          .slice(0, 12)
      : [];
    const standard = str(record["contentStandardText"]);
    const content = [
      indicatorText,
      standard ? `Content standard: ${standard}` : "",
      exemplars.length ? `Exemplars:\n${exemplars.map((e, i) => `${i + 1}. ${e}`).join("\n")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 8000);

    entries.push({
      subject,
      grade,
      strand: str(record["strandName"]) || str(record["strand"]) || null,
      sub_strand: str(record["subStrandName"]) || str(record["sub_strand"]) || null,
      indicator: str(record["indicatorCode"]) || str(record["indicator"]) || null,
      content,
      source_text:
        str(record["sourceReference"]) ||
        str(record["source_text"]) ||
        "NaCCA Common Core Programme (JHS 1-3)",
      source_type: "syllabus",
      level: "jhs",
    });
  }
  if (entries.length === 0) throw new Error("No JHS (B7–B9) entries were found in that file.");
  return { entries, skipped };
}

export interface VaultRow {
  id: string;
  subject: string;
  grade: string;
  strand: string | null;
  indicator: string | null;
  content: string;
  source_text: string | null;
  source_type: string;
  created_at: string;
}

/** Rows of one vault section for the admin table. */
export async function fetchVaultRows(level: VaultLevelId, kind: "textbook" | "past"): Promise<VaultRow[]> {
  const types = kind === "past" ? ["past_question", "bece_past_question"] : ["textbook", "syllabus"];
  const { data } = await db("ges_vault_jhs")
    .select("id, subject, grade, strand, indicator, content, source_text, source_type, created_at")
    .eq("level", level)
    .in("source_type", types)
    .order("created_at", { ascending: false })
    .limit(300);
  return (data ?? []) as VaultRow[];
}

export async function deleteVaultRow(id: string) {
  const { error } = await db("ges_vault_jhs").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Reads a PDF in the browser and splits it into vault-sized pieces.
 * When "auto" is chosen, the class is picked up from codes like B7.1.2 or headings like BASIC 8.
 */
export async function pdfToVaultEntries(
  file: File,
  opts: { level: VaultLevelId; subject: string; grade: string; kind: "textbook" | "past" },
  onProgress?: (page: number, total: number) => void,
): Promise<VaultEntry[]> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const fallback = VAULT_LEVELS.find((l) => l.id === opts.level)?.classes[0]?.id ?? "ALL";
  let current = opts.grade === "auto" ? fallback : opts.grade;
  const entries: VaultEntry[] = [];
  let buffer = "";
  let startPage = 1;
  const flush = (page: number) => {
    const text = buffer.replace(/\s+/g, " ").trim();
    buffer = "";
    if (text.length < 80) return;
    entries.push({
      level: opts.level,
      subject: opts.subject,
      grade: current,
      strand: null,
      sub_strand: null,
      indicator: text.match(/\bB\d{1,2}(?:\.\d+){2,4}\b/)?.[0] ?? null,
      content: text.slice(0, 7900),
      source_text: `${file.name} · page ${startPage}${page > startPage ? `–${page}` : ""}`,
      source_type: opts.kind === "past" ? (opts.level === "jhs" ? "bece_past_question" : "past_question") : "textbook",
    });
    startPage = page + 1;
  };
  for (let p = 1; p <= doc.numPages; p++) {
    onProgress?.(p, doc.numPages);
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const text = tc.items.map((it) => ("str" in it ? it.str : "")).join(" ");
    if (opts.grade === "auto") {
      const heading = text.match(/\bBASIC\s*(\d{1,2})\b/i);
      const code = text.match(/\bB(\d{1,2})\.\d/);
      const n = heading?.[1] ?? code?.[1];
      if (n && VAULT_LEVELS.find((l) => l.id === opts.level)?.classes.some((c) => c.id === `B${n}`)) {
        if (`B${n}` !== current && buffer) flush(p - 1);
        current = `B${n}`;
      }
    }
    buffer += " " + text;
    if (buffer.length > 3000) flush(p);
  }
  flush(doc.numPages);
  return entries;
}
