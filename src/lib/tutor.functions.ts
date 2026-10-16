import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Google retired 1.5 and 2.5 Flash-Lite for new keys; 3.5 Flash-Lite is the current successor.
const GEMINI_MODEL = "gemini-3.5-flash-lite";
const CHAT_MODEL = GEMINI_MODEL;

async function callAi(
  messages: { role: string; content: string | Record<string, unknown>[] }[],
  json: boolean,
  opts?: { model?: string; extra?: Record<string, unknown> },
) {
  void opts;
  // Ama runs only on the school's own Google key with Gemini Flash-Lite.
  const gemini = process.env["GEMINI_API_KEY"];
  if (!gemini) throw new Error("The tutor is not set up yet");
  const send = () =>
    fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${gemini}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        messages,
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
  let g = await send();
  // Google is sometimes briefly busy: wait and try a couple more times.
  for (let i = 0; i < 2 && (g.status === 503 || g.status === 429); i++) {
    await new Promise((r) => setTimeout(r, 1200 * (i + 1) + Math.random() * 500));
    g = await send();
  }
  if (g.status === 429 || g.status === 503) throw new Error("Too many students right now. Try again in a moment.");
  if (!g.ok) {
    console.warn("Gemini failed", g.status, (await g.text().catch(() => "")).slice(0, 200));
    throw new Error("The tutor could not answer right now");
  }
  const gb = (await g.json()) as { choices?: { message?: { content?: string } }[] };
  return gb.choices?.[0]?.message?.content ?? "";
}


/** How a Ghanaian teacher writes on the blackboard — no markdown, no LaTeX. */
const BOARD_STYLE = `
How to write your answer (very important):
- Write exactly the way a Ghanaian teacher writes on a blackboard with chalk. Plain words and plain numbers only.
- NEVER use markdown or LaTeX. No #, ##, ###, no **bold**, no *stars*, no $ or $$, no backticks, no \\frac, no \\times.
- To organise a point, use plain labels a Ghanaian classroom uses: "Step 1", "Step 2", "Option A", "(a)", "(b)", "First", "Then", "Finally".
- For Mathematics and any calculation, show the full working line by line like on the board:
  Given: ...
  Step 1: write the formula
  Step 2: substitute the numbers
  Step 3: simplify
  Answer: ... (put the final answer on its own line beginning with "Answer:")
- Write equations with ordinary keyboard symbols: + - × ÷ = ( ) and use / for fractions, for example 3/4 or (x + 2)/5. Write powers as x^2 and roots as √16.
- Speak like a warm Ghanaian teacher: short clauses, encouragement such as "You see", "Look at it this way", "Don't worry, let's break it down together".
- For ANY Mathematics or calculation question you MUST finish with a clean copy of the work. After the explanation, leave one blank line and write the line "FULL WORKOUT:" then rewrite the complete solution the way a student must present it in the exam booklet: only the working lines, no talking, no teaching, no encouragement. Start with "Given:", then the formula, then each substitution and simplification on its own line, and end with "Answer: ..." on its own line. Do not explain anything inside the FULL WORKOUT section.

Diagrams and pictures (only when a visual truly helps understanding):
- For geometry, triangles, angles, bearings, circle theorems, graphs, number lines, Venn diagrams, sets, electric circuits, light rays, levers, pulleys, forces and simple lab apparatus, draw a chalkboard diagram. Put it on its own lines exactly like this, before the FULL WORKOUT:
[DIAGRAM: short caption]
<svg viewBox="0 0 320 220" xmlns="http://www.w3.org/2000/svg"> ... </svg>
[/DIAGRAM]
- Inside the svg use only line, rect, circle, ellipse, polygon, polyline, path, text and g. No scripts, no images, no links, no CSS. The board is dark green, so draw with stroke="#ffffff" fill="none" stroke-width="2", label with fill="#ffffff" font-size="14", and use "#facc15" (yellow), "#60a5fa" (blue) or "#f87171" (red) to highlight angles, the unknown or the answer. Keep every label inside the viewBox, and keep the svg under 2500 characters.
- For detailed topics such as the human heart, plant or animal cells, the digestive system, the water cycle, rock layers, maps or landforms, still draw a simple labelled chalkboard sketch with the same [DIAGRAM] svg format, the way a teacher sketches it on the board. NEVER write [PICTURE: ...].
- In your words, guide the student through the visual, for example "Look at the diagram on the board, side AB is the hypotenuse". Never describe coordinates or svg code in your sentences.
- Use at most one diagram or picture per answer, and skip it completely when words are enough.`;

function persona(name: string, language: string) {
  const tongue =
    language === "pidgin"
      ? "Reply in warm Ghanaian Pidgin English that a WASSCE student understands."
      : language === "twi"
        ? "Reply in simple Twi mixed with English for the technical terms."
        : "Reply in clear simple English a Ghanaian SHS student understands.";
  return `You are ${name}, a friendly Ghanaian secondary school tutor preparing students for the WAEC WASSCE exam. ${tongue} Always use Ghanaian everyday examples (trotro fares, market prices, cedis, Accra, Kumasi, cocoa farms). Keep answers short and encouraging.${BOARD_STYLE}`;
}

const QuestionSchema = z.object({
  question_text: z.string(),
  options: z.object({ A: z.string(), B: z.string(), C: z.string(), D: z.string() }),
  correct_answer: z.enum(["A", "B", "C", "D"]),
  explanation: z.string(),
});

export type GeneratedQuestion = z.infer<typeof QuestionSchema>;

const ANGLES = [
  "definitions and key concepts",
  "calculation or worked numbers",
  "real-life Ghanaian situations",
  "reasoning backwards from a result",
  "common exam traps and misconceptions",
  "comparing and classifying",
  "diagrams, data or tables described in words",
  "cause and effect / why questions",
];
function angleList(round: number) {
  const start = (round * 3) % ANGLES.length;
  return [...ANGLES.slice(start), ...ANGLES.slice(0, start)].join("; ");
}

const GRADE_NAMES: Record<string, string> = {
  B1: "Basic 1", B2: "Basic 2", B3: "Basic 3", B4: "Basic 4", B5: "Basic 5", B6: "Basic 6",
  B7: "JHS 1 (Basic 7)", B8: "JHS 2 (Basic 8)", B9: "JHS 3 (Basic 9)",
  SHS1: "SHS 1", SHS2: "SHS 2", SHS3: "SHS 3",
};

/** Creates WASSCE-style practice questions when no past paper question exists for a topic. */
export const generateQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        subject: z.string().min(2).max(80),
        topic: z.string().min(2).max(120),
        count: z.number().int().min(1).max(5).default(3),
        tutorName: z.string().min(1).max(40).default("Ama"),
        language: z.string().default("english"),
        standard: z.string().max(600).optional(),
        level: z.enum(["shs", "jhs", "primary", "kids", "others"]).optional(),
        grade: z.string().max(12).optional(),
        avoid: z.array(z.string().max(400)).max(40).optional(),
        round: z.number().int().min(0).max(100000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const levelLine: Record<string, string> = {
      shs: "Senior High School level. Match the real WAEC WASSCE standard and syllabus.",
      jhs: "Junior High School (Basic 7 to 9) level. Match the GES NaCCA JHS curriculum and BECE standard, not WASSCE.",
      primary: "Primary school (Basic 1 to 6) level. Match the GES NaCCA primary curriculum. Use simple short words.",
      kids: "Kindergarten / early years level. Very simple, fun questions a young child can answer.",
      others: "Tertiary level in Ghana.",
    };
    const gradeName = data.grade ? (GRADE_NAMES[data.grade] ?? data.grade) : "";
    const base = `${levelLine[data.level ?? "shs"]}${gradeName ? ` The student is in ${gradeName}: pitch every question exactly at ${gradeName} standard.` : ""}`;
    const standardLine = data.standard
      ? `${base} ${data.standard} Write the questions in the style of that body's licensing/qualifying exams, not WASSCE.`
      : base;
    const raw = await callAi(
      [
        { role: "system", content: persona(data.tutorName, data.language) },
        {
          role: "user",
          content: `Write ${data.count} multiple choice questions for the subject "${data.subject}" on EXACTLY the topic "${data.topic}". ${standardLine} Every question must be strictly about "${data.topic}" within ${data.subject} — never another topic or subject. Cover the topic from different angles, one angle per question, starting with: ${angleList(data.round ?? 0)}. Vary which option letter is correct. ${data.avoid?.length ? `Do NOT repeat or rephrase any of these already-asked questions:\n- ${data.avoid.join("\n- ")}\n` : ""}Keep each explanation short (2-4 lines). Return JSON exactly like {"questions":[{"question_text":"...","options":{"A":"...","B":"...","C":"...","D":"..."},"correct_answer":"A","explanation":"short steps, with a Ghanaian example"}]}`,
        },
      ],
      true,
    );
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("The tutor could not write questions right now");
    }
    const list = (parsed as { questions?: unknown[] }).questions ?? [];
    const questions = list
      .map((item) => QuestionSchema.safeParse(item))
      .filter((r) => r.success)
      .map((r) => (r as { data: GeneratedQuestion }).data);
    if (questions.length === 0) throw new Error("The tutor could not write questions right now");
    return { questions };
  });

/**
 * JHS students are taught strictly from the GES vault — never from the internet.
 */
const VAULT_NOT_FOUND = {
  primary: "This is not in your Basic syllabus vault yet.",
  jhs: "This is not in the JHS syllabus, focus on BECE.",
  shs: "This is not in your SHS syllabus vault yet.",
} as const;
type VaultLevel = keyof typeof VAULT_NOT_FOUND;
const VAULT_AUDIENCE: Record<VaultLevel, string> = {
  primary: "primary pupils (Basic 1 to Basic 6)",
  jhs: "JHS students (Basic 7 to Basic 9)",
  shs: "SHS students (SHS 1 to SHS 3), preparing for WASSCE",
};
function becePersona(name: string, context: string, level: VaultLevel) {
  const notFound = VAULT_NOT_FOUND[level];
  return `You are ${name}, FindMit's tutor for Ghanaian ${VAULT_AUDIENCE[level]}.

Rules you must never break:
- You ONLY answer using the official GES NaCCA syllabus and exam material in the VAULT below.
- If the answer is not contained in or supported by the vault, reply exactly: "${notFound}"
- If the matching vault material is for a different class than the student's class, say "This topic is for <that class>. Switch to <that class>." and stop.
- Start every answer with one line: <Class> > <Strand> > <Sub-strand> > Indicator <code>, taken from the vault.
- Teach in 3 steps: "Step 1: What the syllabus says" (faithful paraphrase of the indicator), "Step 2: Break it down" (in simple terms with an everyday Ghanaian example suited to the age), "Step 3: Example" (a worked example following the vault exemplars).
- Never search the internet, never use outside facts, never invent a syllabus standard.
- After answering, follow the exact same pattern as the vault material and write a line "TRY THESE:" then give 5 NEW practice questions in the same GES pattern (2 same difficulty, 2 slightly harder, 1 exam-style) of your own (number them 1. and 2.) so the student understands easily. Give the answer to each question on the next line.
- Teach the way a warm Ghanaian teacher teaches: short clauses, Ghanaian examples, encouragement.${BOARD_STYLE}

VAULT (your only source):
${context || "(empty)"}`;
}

/** Ama explains a question, a topic, or answers a free-form student question. */
export const askTutor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        prompt: z.string().max(4000).default(""),
        image: z.string().max(8_000_000).optional(),
        tutorName: z.string().min(1).max(40).default("Ama"),
        language: z.string().default("english"),
        level: z.string().optional(),
        subject: z.string().optional(),
        grade: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    if (!data.image && data.prompt.trim().length < 2) throw new Error("Type a question or add a photo");
    const photoNote = data.image
      ? `\n\nThe student sent a photo${data.prompt.trim() ? " with the message above" : " with no message"}. First read the photo carefully: copy out any printed or handwritten question, note diagrams, tables or working. Work out exactly what the student needs. If it is a Mathematics or calculation question, solve it fully with Given, the steps and the FULL WORKOUT. If the photo shows the student's own working, check it and point out any mistake kindly. If the photo is unclear, say what you can see and ask for a clearer picture.`
      : "";
    const userContent = (text: string) =>
      data.image
        ? [
            { type: "text", text: text || "Please read this photo and explain it to me in detail." },
            { type: "image_url", image_url: { url: data.image } },
          ]
        : text;

    if (data.level === "jhs" || data.level === "primary" || data.level === "shs") {
      const vl: VaultLevel = data.level;
      const { searchVault, vaultContext } = await import("@/lib/vault.functions");
      let query = data.prompt;
      if (data.image) {
        // Read the photo first so the vault search knows what the question is about.
        const seen = await callAi(
          [
            { role: "system", content: "Transcribe the school question or topic in this photo in one or two plain sentences. No answer." },
            { role: "user", content: userContent(data.prompt) },
          ],
          false,
        ).catch(() => "");
        query = `${data.prompt} ${seen}`.trim();
      }
      // Search on the student's own words; the subject label is only a hint, never a filter,
      // because vault subject names do not always match the class-level labels.
      const chunks = await searchVault(context.supabase, `${data.subject ?? ""} ${query}`.trim(), {
        grade: data.grade ?? null,
        level: data.level,
        count: 3,
      });
      if (chunks.length === 0) {
        return { answer: VAULT_NOT_FOUND[vl], vault: [] };
      }
      const answer = await callAi(
        [
          { role: "system", content: becePersona(data.tutorName, vaultContext(chunks), vl) + photoNote },
          { role: "user", content: userContent(data.prompt) },
        ],
        false,
      );
      return { answer, vault: chunks };
    }
    const { vaultGuidance } = await import("@/lib/vault.functions");
    const guide = await vaultGuidance(context.supabase, data.level, `${data.subject ?? ""} ${data.prompt}`.trim(), data.grade);
    const answer = await callAi(
      [
        { role: "system", content: persona(data.tutorName, data.language) + guide + photoNote },
        { role: "user", content: userContent(data.prompt) },
      ],
      false,
    );
    return { answer, vault: [] };
  });

export interface WebSource {
  title: string;
  url: string;
  snippet: string;
}

function decodeEntities(input: string) {
  return input
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function stripTags(input: string) {
  return decodeEntities(input.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

/** Recent Ghanaian and international news for the question. */
async function searchNews(query: string): Promise<WebSource[]> {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-GH&gl=GH&ceid=GH:en`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122 Safari/537.36" },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const results: WebSource[] = [];
    for (const block of xml.split("<item>").slice(1, 8)) {
      const title = stripTags(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
      const link = stripTags(block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "");
      const source = stripTags(block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? "");
      const date = stripTags(block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? "");
      if (title && link.startsWith("http")) {
        results.push({ title, url: link, snippet: [source, date].filter(Boolean).join(" · ") });
      }
      if (results.length >= 4) break;
    }
    return results;
  } catch {
    return [];
  }
}

/** Encyclopedia background for factual questions. */
async function searchReference(query: string): Promise<WebSource[]> {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      query,
    )}&srlimit=3&format=json&origin=*`;
    const res = await fetch(url, { headers: { "User-Agent": "FindMit/1.0 (tutor)" } });
    if (!res.ok) return [];
    const body = (await res.json()) as {
      query?: { search?: { title: string; snippet: string }[] };
    };
    return (body.query?.search ?? []).slice(0, 3).map((r) => ({
      title: r.title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`,
      snippet: stripTags(r.snippet),
    }));
  } catch {
    return [];
  }
}

/** Live web lookup so the tutor can talk about current WAEC news and events. */
async function searchWeb(query: string): Promise<WebSource[]> {
  const [news, reference] = await Promise.all([searchNews(query), searchReference(query)]);
  const merged = [...news, ...reference];
  const seen = new Set<string>();
  return merged.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true))).slice(0, 5);
}

/** Decides whether a student question needs fresh information from the web. */
function needsWeb(question: string) {
  const q = question.toLowerCase();
  return /\b(latest|today|current|recent|news|update|updates|2025|2026|timetable|registration|result|results|release|price|who is|when is|deadline|happening|score|election|president)\b/.test(
    q,
  );
}

/**
 * Heavy calculation work needs deeper thinking; everyday questions do not.
 * Keeping light questions on low effort is what makes Ama reply almost at once.
 */
function needsDeepThinking(question: string) {
  const q = question.toLowerCase();
  const mathWords =
    /\b(solve|calculate|prove|derive|differentiate|integrate|simplify|factorise|factorize|equation|equations|simultaneous|quadratic|logarithm|indices|matrix|matrices|vector|probability|permutation|combination|stoichiometry|mole|moles|titration|velocity|acceleration|momentum|elasticity|depreciation|interest|profit and loss|balance sheet|trial balance)\b/;
  const manyNumbers = (q.match(/\d/g) ?? []).length >= 6;
  const hasOperators = /[=+×÷^√]|\d\s*[-/]\s*\d/.test(question);
  return mathWords.test(q) || (manyNumbers && hasOperators);
}


/** Full conversation with the tutor inside FindMit chat, with live web facts. */
export const chatWithAma = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        question: z.string().min(1).max(2000),
        history: z
          .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
          .max(12)
          .default([]),
        tutorName: z.string().min(1).max(40).default("Ama"),
        language: z.string().default("english"),
        level: z.string().optional(),
        subject: z.string().optional(),
        grade: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    // JHS students learn strictly from the GES vault — never from the internet.
    if (data.level === "jhs" || data.level === "primary" || data.level === "shs") {
      const vl: VaultLevel = data.level;
      const { searchVault, vaultContext } = await import("@/lib/vault.functions");
      const chunks = await searchVault(context.supabase, `${data.subject ?? ""} ${data.question}`.trim(), {
        grade: data.grade ?? null,
        level: data.level,
        count: 3,
      });
      if (chunks.length === 0) {
        return { answer: VAULT_NOT_FOUND[vl], sources: [] as WebSource[] };
      }
      const answer = await callAi(
        [
          { role: "system", content: becePersona(data.tutorName, vaultContext(chunks), vl) },
          ...data.history,
          { role: "user", content: data.question },
        ],
        false,
        { model: CHAT_MODEL, extra: { reasoning_effort: "low" } },
      );
      return { answer, sources: [] as WebSource[] };
    }

    const sources = needsWeb(data.question) ? await searchWeb(data.question) : [];
    const webContext =
      sources.length > 0
        ? `\n\nHere is fresh information from the web (today is ${new Date().toDateString()}). Use it, and mention the source name when the fact is recent:\n${sources
            .map((s, i) => `[${i + 1}] ${s.title} — ${s.snippet} (${s.url})`)
            .join("\n")}`
        : "";

    // Everyday questions answer on light thinking so Ama replies almost at once;
    // only heavy calculations pay for deeper thinking.
    const deep = needsDeepThinking(data.question);
    const { vaultGuidance } = await import("@/lib/vault.functions");
    const guide = await vaultGuidance(context.supabase, data.level, `${data.subject ?? ""} ${data.question}`.trim(), data.grade);

    const answer = await callAi(

      [
        {
          role: "system",
          content: `${persona(data.tutorName, data.language)} You are chatting inside the FindMit app and you are a top-class general tutor as well as a WASSCE expert.

How to answer:
- Think the problem through carefully before replying, and give the correct answer, not a vague one.
- For Maths, Physics, Chemistry and Economics, show clear numbered steps and the final answer on its own line.
- For essays, comprehension and summary writing, give structure, topic sentences and a short model example.
- For Science and Social Studies, define the key term first, then explain the idea with a Ghanaian example.
- Follow the WAEC marking scheme style and point out the marks examiners usually look for.
- Remember what the student already asked, so follow-ups like "why?" or "another example" make sense.
- Answer any general question the student asks, not only school work, but stay respectful and age appropriate.
- Keep replies under 180 words unless the student asks for full working or a full essay.
- Your answers are often read aloud, so write the way a warm Ghanaian teacher speaks: short rhythmic clauses, natural commas for pauses, no long tangled sentences.
- Sprinkle in familiar Ghanaian classroom encouragement where it fits naturally, such as "You see", "Look at it this way", "Good question", "Don't worry, let's break it down together".
- Write amounts as "Ghana cedis" in words rather than symbols, and spell out abbreviations the first time so they read well aloud.
- Never invent facts about dates, results or news; if you are unsure, say so plainly.${webContext}${guide}`,
        },
        ...data.history,
        { role: "user", content: data.question },
      ],
      false,
      { model: CHAT_MODEL, extra: { reasoning_effort: deep ? "medium" : "low" } },
    );
    return { answer, sources };
  });

/** Turns a recorded voice note into text so Ama can answer it. */
export const transcribeVoiceNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ audio: z.string().min(10).max(14_000_000), mime: z.string().max(100) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { geminiKey, geminiPost, GEMINI_VOICE_MODEL } = await import("@/lib/gemini.server");
    const key = geminiKey("Voice is not configured");
    const base = data.audio.includes(",") ? data.audio.split(",")[1]! : data.audio;
    const type = data.mime.startsWith("audio/") ? data.mime.split(";")[0]! : "audio/webm";
    const res = await geminiPost(
      `models/${GEMINI_VOICE_MODEL}:generateContent`,
      {
        contents: [
          {
            parts: [
              { inlineData: { mimeType: type, data: base } },
              { text: "Transcribe this student's voice note exactly as spoken (English, Ghanaian Pidgin or Twi). Return only the spoken words, nothing else." },
            ],
          },
        ],
      },
      key,
    );
    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      if (res.status === 429 || res.status === 503) throw new Error("Too many requests. Try again shortly.");
      throw new Error(`Could not understand the voice note (${res.status}) ${msg.slice(0, 120)}`);
    }
    const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const done = (body.candidates?.[0]?.content?.parts ?? []).map((x) => x.text ?? "").join("");
    const text = "";
    return { text: (done || text).trim() };
  });
