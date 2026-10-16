import { stripDiagrams } from "@/lib/diagrams";
import { useCachedState } from "@/lib/page-cache";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { setVoiceTuning } from "@/lib/ama-voice";

/** Loose query helper: the tutor tables are newer than the generated types. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (t: string) => (supabase as unknown as { from: (t: string) => any }).from(t);

export const FREE_QUESTIONS_PER_DAY = 5;

export interface TutorSettings {
  tutor_name: string;
  avatar_url: string | null;
  greeting: string;
  language: string;
  voice_rate?: number;
  voice_pitch?: number;
  voice_volume?: number;
  voice_cadence?: string;
  voice_phonetics?: boolean;
  /** Days of free Practice + Ask Ama for new students (admin-editable). */
  free_trial_days?: number;
}

/** Pushes the admin's saved voice tuning into Ama's speech engine. */
function applyVoiceRow(row: TutorSettings) {
  const cadence = row.voice_cadence;
  setVoiceTuning({
    ...(row.voice_rate != null ? { rate: Number(row.voice_rate) } : {}),
    ...(row.voice_pitch != null ? { pitch: Number(row.voice_pitch) } : {}),
    ...(row.voice_volume != null ? { volume: Number(row.voice_volume) } : {}),
    ...(cadence === "relaxed" || cadence === "standard" || cadence === "brisk" ? { cadence } : {}),
    ...(row.voice_phonetics != null ? { phonetics: row.voice_phonetics } : {}),
  });
}

export const DEFAULT_TUTOR: TutorSettings = {
  tutor_name: "Ama",
  avatar_url: null,
  greeting: "Akwaaba! I be Ama, your WASSCE tutor. Make we learn together.",
  language: "english",
};

export const SUBJECTS: { name: string; topics: string[] }[] = [
  {
    name: "Core Mathematics",
    topics: ["Sets", "Fractions & Percentages", "Algebra", "Indices & Logarithms", "Geometry", "Statistics", "Probability", "Trigonometry"],
  },
  {
    name: "English Language",
    topics: ["Comprehension", "Summary Writing", "Lexis & Structure", "Essay Writing", "Registers", "Literary Devices"],
  },
  {
    name: "Integrated Science",
    topics: ["Cells & Living Things", "Photosynthesis", "Ecosystems", "Acids, Bases & Salts", "Electricity", "Forces & Motion", "Soil & Agriculture", "Human Health"],
  },
  {
    name: "Social Studies",
    topics: ["Environment", "Governance & Democracy", "Ghanaian Culture", "Population", "Nation Building", "Sustainable Development"],
  },
];

export type ClassLevelId = "shs" | "jhs" | "primary" | "kids" | "others";

export interface ClassLevel {
  id: ClassLevelId;
  label: string;
  blurb: string;
  exam: string;
  subjects: { name: string; topics: string[] }[];
}

/** Class categories shown first on the tutor page. */
export const CLASS_LEVELS: ClassLevel[] = [
  {
    id: "shs",
    label: "SHS",
    blurb: "Senior High School · WASSCE preparation",
    exam: "WASSCE",
    subjects: SUBJECTS,
  },
  {
    id: "jhs",
    label: "JHS",
    blurb: "Junior High School · BECE preparation",
    exam: "BECE",
    subjects: [
      {
        name: "Mathematics (JHS)",
        topics: ["Numbers & Numerals", "Fractions & Decimals", "Ratio & Proportion", "Algebraic Expressions", "Shapes & Measurement", "Handling Data"],
      },
      {
        name: "English Language (JHS)",
        topics: ["Comprehension", "Grammar", "Composition Writing", "Letter Writing", "Vocabulary", "Reading Aloud"],
      },
      {
        name: "Integrated Science (JHS)",
        topics: ["Living & Non-living Things", "Matter", "Energy", "Plants & Animals", "Human Body", "Farming & Soil"],
      },
      {
        name: "Social Studies (JHS)",
        topics: ["Our Environment", "Ghana's Culture", "Citizenship", "Family Life", "Resources", "Nation Building"],
      },
      {
        name: "Computing / ICT (JHS)",
        topics: ["Parts of a Computer", "Word Processing", "Internet Safety", "Files & Folders", "Spreadsheets"],
      },
    ],
  },
  {
    id: "primary",
    label: "PRIMARY",
    blurb: "Class 1 to 6 · Everyday school work",
    exam: "Primary school",
    subjects: [
      {
        name: "Mathematics (Primary)",
        topics: ["Counting & Place Value", "Addition & Subtraction", "Multiplication & Division", "Fractions", "Money", "Time", "Shapes"],
      },
      {
        name: "English (Primary)",
        topics: ["Reading", "Spelling", "Simple Grammar", "Story Writing", "Vocabulary"],
      },
      {
        name: "Science (Primary)",
        topics: ["Plants", "Animals", "Weather", "Water", "Our Body", "Keeping Clean"],
      },
      {
        name: "Our World Our People",
        topics: ["My Family", "My Community", "Ghana's Festivals", "Good Manners", "Safety"],
      },
      {
        name: "Creative Arts",
        topics: ["Drawing", "Colours", "Songs & Rhythm", "Craft Making"],
      },
    ],
  },
  {
    id: "kids",
    label: "KIDS",
    blurb: "Kindergarten & little learners",
    exam: "Kindergarten",
    subjects: [
      {
        name: "Letters & Sounds",
        topics: ["Alphabet A to Z", "Phonics", "First Words", "Rhymes"],
      },
      {
        name: "Numbers & Counting",
        topics: ["Count 1 to 20", "Shapes", "Colours", "Big and Small"],
      },
      {
        name: "My World",
        topics: ["Animals", "Fruits & Food", "My Body", "Family", "Good Habits"],
      },
      {
        name: "Story Time",
        topics: ["Ananse Stories", "Short Stories", "Songs"],
      },
    ],
  },
  {
    id: "others",
    label: "OTHERS",
    blurb: "Trades, languages and general knowledge",
    exam: "General learning",
    subjects: [
      {
        name: "Ghanaian Languages",
        topics: ["Twi Basics", "Ga Basics", "Ewe Basics", "Proverbs"],
      },
      {
        name: "Trades & TVET",
        topics: ["Tailoring", "Catering", "Electricals", "Welding", "Hairdressing", "Masonry"],
      },
      {
        name: "Life & Money Skills",
        topics: ["Saving Money", "Small Business", "Mobile Money Safety", "Job Interviews", "CV Writing"],
      },
      {
        name: "General Knowledge",
        topics: ["Ghana History", "World Facts", "Current Affairs", "Health"],
      },
    ],
  },
];

type SubjectList = { name: string; topics: string[] }[];

/** OTHERS class: subjects and topics for each Ghanaian tertiary field. */
export const FIELD_SUBJECTS: Record<string, SubjectList> = {
  "Nursing Training": [
    { name: "Anatomy & Physiology", topics: ["Skeletal System", "Cardiovascular System", "Nervous System", "Respiratory System", "Renal System", "Endocrine & Reproductive Systems"] },
    { name: "Fundamentals of Nursing", topics: ["Nursing Process", "Vital Signs", "Infection Prevention & Control", "Wound Care & Dressings", "Admission & Discharge", "Patient Hygiene"] },
    { name: "Medical-Surgical Nursing", topics: ["Cardiovascular Disorders", "Respiratory Disorders", "Perioperative Care", "Fluid & Electrolyte Balance", "Diabetes & Endocrine Disorders"] },
    { name: "Pharmacology for Nurses", topics: ["Drug Calculations & Dosages", "Routes of Administration", "Antibiotics", "Analgesics", "Emergency Drugs"] },
    { name: "Community Health Nursing", topics: ["Primary Health Care", "EPI & Immunisation", "Communicable Diseases", "Health Promotion", "School Health"] },
    { name: "Mental Health Nursing", topics: ["Therapeutic Communication", "Schizophrenia & Psychosis", "Mood Disorders", "Substance Abuse", "Crisis Intervention"] },
    { name: "Paediatric Nursing", topics: ["Growth & Development", "Childhood Illnesses (IMNCI)", "Malnutrition", "Neonatal Care"] },
  ],
  "Midwifery Training": [
    { name: "Antenatal Care", topics: ["Booking Assessment", "Fetal Wellbeing", "High-Risk Pregnancy", "Nutrition in Pregnancy", "Minor Disorders of Pregnancy"] },
    { name: "Normal Labour & Delivery", topics: ["Stages of Labour", "Partograph", "Mechanism of Labour", "Newborn Resuscitation", "Perineal Care"] },
    { name: "Postnatal & Neonatal Care", topics: ["Puerperium", "Exclusive Breastfeeding", "Kangaroo Mother Care", "Postnatal Complications"] },
    { name: "Obstetric Emergencies", topics: ["Postpartum Haemorrhage", "Pre-eclampsia & Eclampsia", "Obstructed Labour", "Puerperal Sepsis", "Cord Prolapse"] },
    { name: "Reproductive Health & Family Planning", topics: ["Contraceptive Methods", "STIs", "Adolescent Reproductive Health", "Infertility"] },
  ],
  "Teacher Training (College of Education)": [
    { name: "Educational Psychology", topics: ["Learning Theories", "Child & Adolescent Development", "Motivation", "Individual Differences"] },
    { name: "Curriculum & Pedagogy", topics: ["Lesson Planning", "Learning Indicators", "Teaching Methods", "Teaching & Learning Materials", "Classroom Management"] },
    { name: "Assessment in Education", topics: ["Continuous Assessment", "Test Construction", "Validity & Reliability", "Marking Schemes & Rubrics"] },
    { name: "Literacy & Numeracy Methods", topics: ["Early Grade Reading", "Phonics", "Teaching Mathematics", "Ghanaian Language Teaching"] },
    { name: "Inclusive Education & Guidance", topics: ["Special Educational Needs", "Gifted Learners", "Guidance & Counselling", "Child Protection"] },
    { name: "Teaching Practice (STS)", topics: ["Supported Teaching in School", "Reflective Journal", "Action Research", "Professional Ethics (NTC)"] },
  ],
  "University": [
    { name: "Academic Writing", topics: ["Essay Structure", "Referencing (APA)", "Avoiding Plagiarism", "Research Proposal"] },
    { name: "Critical Thinking & Logic", topics: ["Arguments", "Fallacies", "Deductive & Inductive Reasoning", "Problem Solving"] },
    { name: "Research Methods", topics: ["Qualitative vs Quantitative", "Sampling", "Data Collection", "Research Ethics"] },
    { name: "Statistics", topics: ["Descriptive Statistics", "Probability", "Hypothesis Testing", "Correlation & Regression"] },
    { name: "Economics & Business", topics: ["Microeconomics", "Macroeconomics", "Principles of Management", "Financial Accounting"] },
    { name: "Computing & IT", topics: ["Programming Basics", "Databases", "Networking", "Data Structures"] },
  ],
  "Technical University": [
    { name: "Engineering Mathematics", topics: ["Calculus", "Vectors & Matrices", "Differential Equations", "Complex Numbers"] },
    { name: "Applied Mechanics", topics: ["Statics", "Dynamics", "Strength of Materials", "Thermodynamics"] },
    { name: "Electrical & Electronics", topics: ["Circuit Analysis", "Digital Electronics", "Electrical Installation", "Power Systems"] },
    { name: "Technical Drawing & CAD", topics: ["Orthographic Projection", "Isometric Drawing", "CAD Basics", "Workshop Practice"] },
    { name: "Entrepreneurship", topics: ["Business Plan", "Costing & Pricing", "Quality Control", "Industrial Safety"] },
  ],
  "Polytechnic": [
    { name: "Applied Mathematics", topics: ["Algebra", "Calculus", "Statistics", "Business Mathematics"] },
    { name: "Accounting & Finance", topics: ["Book-keeping", "Financial Statements", "Cost Accounting", "Taxation in Ghana"] },
    { name: "Engineering Practice", topics: ["Workshop Safety", "Materials", "Electrical Installation", "Maintenance"] },
    { name: "Communication Skills", topics: ["Report Writing", "Business Letters", "Presentations", "Minutes Writing"] },
  ],
  "Health Assistant Training": [
    { name: "Basic Nursing & First Aid", topics: ["Vital Signs", "First Aid", "Patient Hygiene", "Bed Making"] },
    { name: "Community Health", topics: ["Water & Sanitation", "Disease Prevention", "Home Visiting", "Immunisation"] },
    { name: "Human Biology", topics: ["Body Systems", "Nutrition", "Infection Transmission"] },
  ],
  "Agricultural College": [
    { name: "Crop Production", topics: ["Soil Fertility", "Cereal Crops", "Cocoa & Tree Crops", "Pest & Disease Control", "Irrigation"] },
    { name: "Animal Husbandry", topics: ["Poultry Management", "Ruminants", "Animal Health", "Pasture Management"] },
    { name: "Agribusiness", topics: ["Farm Records & Budgeting", "Agricultural Marketing", "Agricultural Finance"] },
  ],
  "Professional Institute (ICAG, CIMG, etc.)": [
    { name: "Financial Accounting", topics: ["IFRS", "Financial Statements", "Ratio Analysis", "Consolidation"] },
    { name: "Auditing", topics: ["Audit Planning", "Internal Controls", "Audit Evidence", "Audit Reports"] },
    { name: "Marketing", topics: ["Segmentation", "Consumer Behaviour", "Digital Marketing", "Brand Management"] },
    { name: "Business Law & Ethics", topics: ["Companies Act, 2019 (Act 992)", "Law of Contract", "Professional Ethics"] },
    { name: "Taxation", topics: ["Income Tax (Act 896)", "VAT", "Tax Administration"] },
  ],
};

interface TutorSubjectRow {
  level: string;
  name: string;
  topics: string[] | null;
  hidden: boolean;
}

/** Subjects for a class: built-in list plus admin additions, minus admin removals. */
export function useLevelSubjects(level: ClassLevel | null) {
  const [rows, setRows] = useCachedState<TutorSubjectRow[]>("tutor:subjects", []);

  const load = useCallback(async () => {
    const { data } = await db("tutor_subjects").select("level, name, topics, hidden");
    if (data) setRows(data as TutorSubjectRow[]);
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`tutor-subjects-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tutor_subjects" }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const base = level?.subjects ?? SUBJECTS;
  const id = level?.id ?? "shs";
  const mine = rows.filter((r) => r.level === id);
  const hidden = new Set(mine.filter((r) => r.hidden).map((r) => r.name));
  const added = mine
    .filter((r) => !r.hidden && !base.some((b) => b.name === r.name))
    .map((r) => ({ name: r.name, topics: r.topics ?? [] }));
  const subjects = [...base.filter((b) => !hidden.has(b.name)), ...added];

  return { subjects, reload: load };
}

export async function addLevelSubject(level: string, name: string, topics: string[]) {
  const { error } = await db("tutor_subjects").upsert(
    { level, name, topics, hidden: false },
    { onConflict: "level,name" },
  );
  if (error) throw error;
}

/** Removes a subject from a class for everyone (built-in ones are hidden). */
export async function removeLevelSubject(level: string, name: string) {
  const { error } = await db("tutor_subjects").upsert(
    { level, name, topics: [], hidden: true },
    { onConflict: "level,name" },
  );
  if (error) throw error;
}

export interface WassceQuestion {
  id: string | null;
  subject: string;
  topic: string;
  year: number | null;
  question_text: string;
  options: Record<string, string>;
  correct_answer: string;
  explanation: string;
  source: string;
}

/** Tutor name/avatar/language, editable by admins in Settings. */
export function useTutorSettings() {
  const [settings, setSettings] = useCachedState<TutorSettings>("tutor:settings", DEFAULT_TUTOR, () => setLoading(false));
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await db("tutor_settings")
      .select("tutor_name, avatar_url, greeting, language, voice_rate, voice_pitch, voice_volume, voice_cadence, voice_phonetics, free_trial_days")
      .eq("id", 1)
      .maybeSingle();
    if (data) {
      setSettings(data as TutorSettings);
      applyVoiceRow(data as TutorSettings);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    applyVoiceRow(settings);
  }, [settings]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`tutor-settings-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tutor_settings" }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  return { settings, loading, reload: load };
}

export async function updateTutorSettings(next: Partial<TutorSettings>) {
  const { data, error } = await db("tutor_settings")
    .update({ ...next, updated_at: new Date().toISOString() })
    .eq("id", 1)
    .select("id");
  if (error) throw error;
  if (!data || (data as unknown[]).length === 0) {
    throw new Error("Not saved — your account isn't allowed to change Ama's settings.");
  }
}

export async function fetchPastQuestions(subject: string, topic: string, limit = 10) {
  const { data } = await db("wassce_questions")
    .select("*")
    .eq("subject", subject)
    .eq("topic", topic)
    .limit(limit);
  return ((data ?? []) as WassceQuestion[]).map((q) => ({ ...q, options: q.options ?? {} }));
}

export async function saveGeneratedQuestion(
  q: Omit<WassceQuestion, "id" | "year" | "source">,
  userId: string,
) {
  const { data } = await db("wassce_questions")
    .insert({ ...q, source: "ai", created_by: userId })
    .select("id")
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

export async function recordAttempt(input: {
  userId: string;
  questionId: string | null;
  subject: string;
  topic: string;
  selected: string;
  isCorrect: boolean;
  seconds: number;
}) {
  await db("wassce_attempts").insert({
    user_id: input.userId,
    question_id: input.questionId,
    subject: input.subject,
    topic: input.topic,
    selected_option: input.selected,
    is_correct: input.isCorrect,
    time_taken_seconds: Math.round(input.seconds),
  });
}

export interface TopicScore {
  topic: string;
  correct: number;
  total: number;
}

export async function fetchMyScores(userId: string) {
  const { data } = await db("wassce_attempts")
    .select("topic, is_correct, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(500);
  const rows = (data ?? []) as { topic: string; is_correct: boolean; created_at: string }[];
  const map = new Map<string, TopicScore>();
  for (const row of rows) {
    const entry = map.get(row.topic) ?? { topic: row.topic, correct: 0, total: 0 };
    entry.total += 1;
    if (row.is_correct) entry.correct += 1;
    map.set(row.topic, entry);
  }
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = rows.filter((r) => r.created_at.slice(0, 10) === today).length;
  const correct = rows.filter((r) => r.is_correct).length;
  return {
    byTopic: [...map.values()].sort((a, b) => a.correct / a.total - b.correct / b.total),
    todayCount,
    total: rows.length,
    correct,
  };
}

/** Rough WASSCE grade from the running percentage. */
export function predictedGrade(percent: number) {
  if (percent >= 80) return "A1";
  if (percent >= 75) return "B2";
  if (percent >= 70) return "B3";
  if (percent >= 65) return "C4";
  if (percent >= 60) return "C5";
  if (percent >= 55) return "C6";
  if (percent >= 50) return "D7";
  if (percent >= 45) return "E8";
  return "F9";
}

/** Ghana Education Service / WAEC grade for a percentage score. */
export function gesGrade(percent: number) {
  if (percent >= 80) return "A1";
  if (percent >= 75) return "B2";
  if (percent >= 70) return "B3";
  if (percent >= 65) return "C4";
  if (percent >= 60) return "C5";
  if (percent >= 55) return "C6";
  if (percent >= 50) return "D7";
  if (percent >= 45) return "E8";
  return "F9";
}

export interface MonthlySubjectScore {
  subject: string;
  correct: number;
  total: number;
  percent: number;
  grade: string;
}

export interface MonthlyScoreRow {
  /** e.g. "2026-01" */
  month: string;
  /** e.g. "January 2026" */
  label: string;
  subjects: MonthlySubjectScore[];
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Monthly report card: every month the student practised gets its own row,
 * with an A1–F9 grade per subject. Older months stay in the list.
 */
export async function fetchMonthlyScores(userId: string): Promise<MonthlyScoreRow[]> {
  const { data } = await db("wassce_attempts")
    .select("subject, is_correct, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(2000);
  const rows = (data ?? []) as { subject: string; is_correct: boolean; created_at: string }[];
  const months = new Map<string, Map<string, { correct: number; total: number }>>();
  for (const row of rows) {
    const month = row.created_at.slice(0, 7);
    const bySubject = months.get(month) ?? new Map();
    const entry = bySubject.get(row.subject) ?? { correct: 0, total: 0 };
    entry.total += 1;
    if (row.is_correct) entry.correct += 1;
    bySubject.set(row.subject, entry);
    months.set(month, bySubject);
  }
  return [...months.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([month, bySubject]) => {
      const [year, mm] = month.split("-");
      return {
        month,
        label: `${MONTH_NAMES[Number(mm) - 1] ?? month} ${year}`,
        subjects: [...bySubject.entries()]
          .map(([subject, v]) => {
            const percent = Math.round((v.correct / v.total) * 100);
            return { subject, correct: v.correct, total: v.total, percent, grade: gesGrade(percent) };
          })
          .sort((a, b) => b.percent - a.percent),
      };
    });
}

/**
 * Turns model markdown (###, **, $$, LaTeX) into plain classroom writing
 * so Ama's explanations read like a teacher on a blackboard.
 */
export function cleanTeacherText(input: string) {
  return stripDiagrams(input)
    .replace(/\r/g, "")
    .replace(/\$\$([\s\S]*?)\$\$/g, (_m, inner: string) => `\n${inner.trim()}\n`)
    .replace(/\\\[([\s\S]*?)\\\]/g, (_m, inner: string) => `\n${inner.trim()}\n`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_m, inner: string) => inner.trim())
    .replace(/\$([^$\n]+)\$/g, (_m, inner: string) => inner.trim())
    .replace(/\\times/g, "×")
    .replace(/\\div/g, "÷")
    .replace(/\\pm/g, "±")
    .replace(/\\sqrt\s*\{([^}]*)\}/g, "√($1)")
    .replace(/\\frac\s*\{([^}]*)\}\s*\{([^}]*)\}/g, "($1)/($2)")
    .replace(/\\left|\\right|\\!|\\,|\\;/g, "")
    .replace(/\\[a-zA-Z]+/g, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/(^|\s)\*(\S[^*]*?)\*/g, "$1$2")
    .replace(/`{1,3}/g, "")
    .replace(/^\s*[-*•]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function fetchMySubscription(userId: string) {
  const { data } = await db("tutor_subscriptions")
    .select("expires_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const expires = (data as { expires_at: string } | null)?.expires_at;
  return expires && new Date(expires) > new Date() ? expires : null;
}

export async function startSubscription(userId: string, amount: number, reference: string) {
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await db("tutor_subscriptions").insert({
    user_id: userId,
    amount,
    reference,
    expires_at: expires,
  });
  if (error) throw error;
}

export interface PendingClassCheck {
  class_id: string;
  topic: string;
}

/** The most recent class the student joined that Ama has not checked on yet. */
export async function fetchPendingClassCheck(userId: string): Promise<PendingClassCheck | null> {
  const { data: enrolments } = await db("class_enrollments")
    .select("class_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(5);
  const ids = ((enrolments ?? []) as { class_id: string }[]).map((r) => r.class_id);
  if (ids.length === 0) return null;

  const { data: classes } = await db("live_classes")
    .select("id, topic, is_live, ended_at")
    .in("id", ids)
    .eq("is_live", false)
    .order("ended_at", { ascending: false })
    .limit(5);
  const ended = ((classes ?? []) as { id: string; topic: string }[])[0];
  if (!ended) return null;

  const { data: logged } = await db("class_understanding")
    .select("id")
    .eq("user_id", userId)
    .eq("class_id", ended.id)
    .maybeSingle();
  if (logged) return null;
  return { class_id: ended.id, topic: ended.topic };
}

export async function logUnderstanding(input: {
  userId: string;
  classId: string;
  topic: string;
  status: "understood" | "confused";
  score?: number;
}) {
  await db("class_understanding").insert({
    user_id: input.userId,
    class_id: input.classId,
    topic: input.topic,
    status: input.status,
    followup_score: input.score ?? 0,
  });
}

export async function updateUnderstandingScore(userId: string, classId: string, score: number) {
  await db("class_understanding")
    .update({ followup_score: score, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("class_id", classId);
}

export interface TutorWebSource {
  title: string;
  url: string;
  snippet: string;
}

export interface TutorChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  web_sources: TutorWebSource[];
  created_at: string;
}

/** The student's saved conversation with the tutor. */
export async function fetchTutorChat(userId: string): Promise<TutorChatMessage[]> {
  const { data } = await db("tutor_chat_messages")
    .select("id, role, content, web_sources, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(200);
  return ((data ?? []) as TutorChatMessage[]).map((row) => ({
    ...row,
    web_sources: Array.isArray(row.web_sources) ? row.web_sources : [],
  }));
}

export async function saveTutorMessage(
  userId: string,
  role: "user" | "assistant",
  content: string,
  webSources: TutorWebSource[] = [],
) {
  await db("tutor_chat_messages").insert({
    user_id: userId,
    role,
    content,
    web_sources: webSources,
  });
}

export async function clearTutorChat(userId: string) {
  await db("tutor_chat_messages").delete().eq("user_id", userId);
}
