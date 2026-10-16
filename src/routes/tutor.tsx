import { useCachedState } from "@/lib/page-cache";
import { TeacherText } from "@/components/tutor/TeacherText";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Camera, Check, ChevronRight, Loader2, Paperclip, Repeat, Send, Sparkles, Square, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AmaAvatar } from "@/components/tutor/AmaAvatar";
import { speakLong } from "@/lib/ama-voice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { useRole } from "@/lib/roles";
import { useAppPrice } from "@/lib/pricing";
import { payWithPaystack } from "@/lib/paystack";
import { askTutor, generateQuestions } from "@/lib/tutor.functions";
import {
  CLASS_LEVELS,
  FREE_QUESTIONS_PER_DAY,
  SUBJECTS,
  type ClassLevel,
  cleanTeacherText,
  fetchMonthlyScores,
  fetchMyScores,
  fetchMySubscription,
  fetchPastQuestions,
  fetchPendingClassCheck,
  logUnderstanding,
  predictedGrade,
  recordAttempt,
  saveGeneratedQuestion,
  startSubscription,
  useTutorSettings,
  useLevelSubjects,
  addLevelSubject,
  removeLevelSubject,
  type MonthlyScoreRow,
  type PendingClassCheck,
  type TopicScore,
  type WassceQuestion,
  FIELD_SUBJECTS,
} from "@/lib/tutor";
import { LongPressPlay } from "@/components/tutor/LongPressPlay";
import { KidsWordTracer } from "@/components/tutor/KidsWordTracer";
import { useFreeAccess } from "@/lib/free-access";

export const Route = createFileRoute("/tutor")({
  head: () => ({
    meta: [
      { title: "Ama — WASSCE Tutor | FindMit" },
      {
        name: "description",
        content:
          "Practise Ghana WASSCE past questions with Ama, your friendly AI tutor. Instant marking, step-by-step explanations and your predicted grade.",
      },
      { property: "og:title", content: "Ama — WASSCE Tutor | FindMit" },
      {
        property: "og:description",
        content: "Ghana WASSCE past questions with instant marking and Ama's explanations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TutorPage,
});

type Tab = "practice" | "ask" | "scores";

/** Ama reads the whole answer, sentence by sentence, so nothing is cut off. */
function speak(text: string, onDone?: () => void) {
  return speakLong(text, onDone);
}

function cacheKey(subject: string, topic: string) {
  return `findmit-tutor:${subject}:${topic}`;
}

/** Shrinks a photo (or grabs a clear frame from a video) into a small JPEG Ama can read. */
async function fileToImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    let source: CanvasImageSource;
    let w: number;
    let h: number;
    if (file.type.startsWith("video/")) {
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.src = url;
      await new Promise<void>((res, rej) => {
        video.onloadeddata = () => res();
        video.onerror = () => rej(new Error("video"));
      });
      video.currentTime = Math.min(1, (video.duration || 0) / 2);
      await new Promise<void>((res) => {
        video.onseeked = () => res();
        setTimeout(res, 1500);
      });
      source = video;
      w = video.videoWidth;
      h = video.videoHeight;
    } else {
      const img = new Image();
      img.src = url;
      await img.decode();
      source = img;
      w = img.naturalWidth;
      h = img.naturalHeight;
    }
    const scale = Math.min(1, 1600 / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const GRADE_OPTIONS: Record<string, { code: string; label: string }[]> = {
  primary: [1, 2, 3, 4, 5, 6].map((n) => ({ code: `B${n}`, label: `Basic ${n}` })),
  jhs: [1, 2, 3].map((n) => ({ code: `B${n + 6}`, label: `JHS ${n} (Basic ${n + 6})` })),
  shs: [1, 2, 3].map((n) => ({ code: `SHS${n}`, label: `SHS ${n}` })),
};

function TutorPage() {
  const { user } = useAuth();
  const { isAdmin } = useRole();
  const { settings } = useTutorSettings();
  const { amount: monthlyFee, waived: tutorWaived } = useAppPrice("tutor_monthly");
  const runGenerate = useServerFn(generateQuestions);
  const runAsk = useServerFn(askTutor);

  const [tab, setTab] = useState<Tab>("practice");
  const [level, setLevel] = useState<ClassLevel | null>(null);
  const [subject, setSubject] = useState<string>("");
  const [topic, setTopic] = useState<string>("");
  const [questions, setQuestions] = useState<WassceQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);

  const [askInput, setAskInput] = useState("");
  const [askThread, setAskThread] = useState<{ role: "you" | "ama"; text: string; image?: string }[]>([]);
  const [attachment, setAttachment] = useState<string | null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [asking, setAsking] = useState(false);
  // WhatsApp-style: roll to the newest message (always after the student sends).
  useEffect(() => {
    const last = askThread[askThread.length - 1];
    if (!askEndRef.current) return;
    if (last?.role === "you" || askNearBottomRef.current || asking) {
      requestAnimationFrame(() => askEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askThread.length, asking]);

  const [scores, setScores] = useState<{ byTopic: TopicScore[]; todayCount: number; total: number; correct: number }>({
    byTopic: [],
    todayCount: 0,
    total: 0,
    correct: 0,
  });
  const [subscribedUntil, setSubscribedUntil] = useState<string | null>(null);
  const [pendingCheck, setPendingCheck] = useState<PendingClassCheck | null>(null);
  const [monthly, setMonthly] = useCachedState<MonthlyScoreRow[]>("tutor:monthly", []);
  const startedAt = useRef(Date.now());

  const { subjects: baseSubjects } = useLevelSubjects(level);
  const freeAccess = useFreeAccess();
  const [othersPrefs, setOthersPrefs] = useState<OthersPrefs>({ field: "", accreditation: "" });
  useEffect(() => {
    if (!user) return;
    setOthersPrefs(readOthersPrefs(user.id));
  }, [user]);
  // OTHERS class: subjects follow the student's saved field (Nursing, Teacher Training, ...).
  const levelSubjects = useMemo(() => {
    if (level?.id !== "others") return baseSubjects;
    const fieldList = FIELD_SUBJECTS[othersPrefs.field];
    if (!fieldList) return baseSubjects;
    const extra = baseSubjects.filter(
      (s) => !level.subjects.some((b) => b.name === s.name) && !fieldList.some((f) => f.name === s.name),
    );
    return [...fieldList, ...extra];
  }, [level, baseSubjects, othersPrefs.field]);
  useEffect(() => {
    if (level?.id !== "others") return;
    const first = levelSubjects[0];
    setSubject(first?.name ?? "");
    setTopic(first?.topics[0] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level?.id, othersPrefs.field]);
  const standard =
    level?.id === "others" && othersPrefs.accreditation ? accreditationRule(othersPrefs) : "";
  const levelHint = level
    ? `The learner is at ${level.label} level in Ghana (${level.blurb}). Teach at exactly that level, with simple age-appropriate words and Ghanaian examples. ${standard ? `${standard} ` : ""}`
    : "";
  const topics = useMemo(
    () => levelSubjects.find((s) => s.name === subject)?.topics ?? [],
    [levelSubjects, subject],
  );
  // Exact class (e.g. JHS 2 = B8) the student chose; saved per user until they update it again.
  const [activeGrade, setActiveGrade] = useState<string>("");
  const [draftGrade, setDraftGrade] = useState<string>("");
  const gradeRef = useRef<string>("");
  gradeRef.current = level && GRADE_OPTIONS[level.id] ? activeGrade : "";
  useEffect(() => {
    if (!user) return;
    try {
      const saved = JSON.parse(localStorage.getItem(`tutor_active_class_${user.id}`) ?? "null") as
        | { levelId: string; grade: string }
        | null;
      if (!saved) return;
      const lv = CLASS_LEVELS.find((l) => l.id === saved.levelId);
      if (!lv) return;
      setActiveGrade(saved.grade);
      setDraftGrade(saved.grade);
      setLevel((cur) => cur ?? lv);
    } catch {
      /* ignore bad saved class */
    }
  }, [user]);
  const updateGrade = () => {
    if (!user || !level || !draftGrade) return;
    localStorage.setItem(`tutor_active_class_${user.id}`, JSON.stringify({ levelId: level.id, grade: draftGrade }));
    setActiveGrade(draftGrade);
    setQuestions([]);
    setAskThread([]);
    const name = GRADE_OPTIONS[level.id]?.find((g) => g.code === draftGrade)?.label ?? draftGrade;
    toast.success(`Class updated to ${name}. ${settings.tutor_name} will now teach ${name}.`);
  };
  const pickLevel = useCallback((next: ClassLevel) => {
    setLevel(next);
    if (user) {
      try {
        const saved = JSON.parse(localStorage.getItem(`tutor_active_class_${user.id}`) ?? "null") as
          | { levelId: string; grade: string }
          | null;
        const g = saved?.levelId === next.id ? saved.grade : "";
        setActiveGrade(g);
        setDraftGrade(g || (GRADE_OPTIONS[next.id]?.[0]?.code ?? ""));
      } catch {
        /* ignore */
      }
    }
    setTab("practice");
    const first = next.subjects[0];
    setSubject(first?.name ?? "");
    setTopic(first?.topics[0] ?? "");
    setAskThread([]);
  }, [user]);
  const current = questions[index] ?? null;
  // New users get an admin-set number of free tutoring days (Practice + Ask Ama).
  const trialDays = Math.max(0, Number(settings.free_trial_days ?? 60));
  const trialDaysLeft = user?.created_at
    ? Math.max(0, Math.ceil((new Date(user.created_at).getTime() + trialDays * 86400000 - Date.now()) / 86400000))
    : 0;
  const unlimited =
    Boolean(subscribedUntil) || isAdmin || freeAccess.tutor_unlimited || trialDaysLeft > 0 || tutorWaived;
  const locked = Boolean(user) && !unlimited;

  const refreshScores = useCallback(async () => {
    if (!user) return;
    setScores(await fetchMyScores(user.id));
    setMonthly(await fetchMonthlyScores(user.id).catch(() => []));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void refreshScores();
    void fetchMySubscription(user.id).then(setSubscribedUntil);
    void fetchPendingClassCheck(user.id).then(setPendingCheck);
  }, [user, refreshScores]);

  const stopSayRef = useRef<(() => void) | null>(null);
  const loadReqRef = useRef(0);
  const say = useCallback((text: string, onDone?: () => void) => {
    stopSayRef.current?.();
    setSpeaking(true);
    stopSayRef.current = speak(text, () => {
      setSpeaking(false);
      onDone?.();
    });
  }, []);

  // Stop Ama's voice when the student leaves the page.
  useEffect(() => () => stopSayRef.current?.(), []);

  const loadQuestions = useCallback(
    async (nextSubject: string, nextTopic: string) => {
      // Ama needs a signed-in student: her questions come from a protected server call.
      if (!user) {
        setQuestions([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setExplanation(null);
      setPicked(null);
      setIndex(0);
      // Only the newest choice may update the screen; older slow answers are dropped.
      const reqId = ++loadReqRef.current;
      const isLatest = () => reqId === loadReqRef.current;
      const levelId = level?.id ?? "shs";
      // Non-SHS classes keep their own question bank so WASSCE items never leak in.
      const bankSubject = levelId === "shs" ? nextSubject : `${levelId}|${nextSubject}`;
      const key = `${cacheKey(nextSubject, nextTopic)}:${levelId}:${standard ? "std" : ""}`;
      let shownCached = false;
      try {
        const cached = localStorage.getItem(key);
        if (cached) {
          const list = JSON.parse(cached) as WassceQuestion[];
          if (list.length) {
            setQuestions(list);
            setLoading(false);
            shownCached = true;
          }
        }
      } catch {
        /* ignore bad cache */
      }
      if (!shownCached) setQuestions([]);
      try {
        let found = await fetchPastQuestions(bankSubject, nextTopic);
        if (!isLatest()) return;
        if (found.length === 0) {
          const result = await runGenerate({
            data: {
              subject: nextSubject,
              topic: nextTopic,
              count: 3,
              tutorName: settings.tutor_name,
              language: settings.language,
              level: levelId,
        ...(gradeRef.current ? { grade: gradeRef.current } : {}),
              ...(gradeRef.current ? { grade: gradeRef.current } : {}),
              ...(standard ? { standard } : {}),
            },
          });
          if (!isLatest()) return;
          found = result.questions.map((q) => ({
            id: null,
            subject: nextSubject,
            topic: nextTopic,
            year: null,
            source: "ai",
            ...q,
          }));
          if (user) {
            const saveUser = user.id;
            void Promise.all(
              found.map((q) =>
                saveGeneratedQuestion(
                  {
                    subject: bankSubject,
                    topic: nextTopic,
                    question_text: q.question_text,
                    options: q.options,
                    correct_answer: q.correct_answer,
                    explanation: q.explanation,
                  },
                  saveUser,
                )
                  .then((id) => {
                    if (id) q.id = id;
                  })
                  .catch(() => null),
              ),
            );
          }
        } else {
          found = found.map((q) => ({ ...q, subject: nextSubject }));
        }
        if (shownCached && !isLatest()) return;
        if (!shownCached) setQuestions(found);
        startedAt.current = Date.now();
        try {
          localStorage.setItem(key, JSON.stringify(found));
        } catch {
          /* storage full — practice still works */
        }
      } catch (err) {
        if (!isLatest()) return;
        if (shownCached) toast.info("You are offline — using saved questions");
        else toast.error(err instanceof Error ? err.message : "Could not load questions");
      } finally {
        if (isLatest()) setLoading(false);
      }
    },
    [runGenerate, settings.tutor_name, settings.language, user, standard, level?.id],
  );

  useEffect(() => {
    if (!subject || !topic) return;
    void loadQuestions(subject, topic);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, topic, user?.id, standard, level?.id]);

  const choose = async (option: string) => {
    if (!current || picked || !user) return;
    if (locked) {
      toast.error("Your 60-day free trial has ended. Subscribe to continue.");
      return;
    }
    setPicked(option);
    const isCorrect = option === current.correct_answer;
    // Speak the verdict instantly, fetch the explanation at the same time,
    // then read the explanation as soon as the verdict finishes.
    let verdictDone = false;
    let pending: string | null = null;
    say(isCorrect ? "Correct! Well done." : "Wrong, take a look at it again.", () => {
      verdictDone = true;
      if (pending) say(pending);
    });
    void explain((answer) => {
      if (verdictDone) say(answer);
      else pending = answer;
    });
    void recordAttempt({
      userId: user.id,
      questionId: current.id,
      subject: current.subject,
      topic: current.topic,
      selected: option,
      isCorrect,
      seconds: (Date.now() - startedAt.current) / 1000,
    })
      .catch(() => undefined)
      .then(() => refreshScores());
  };

  // Unlimited practice: write fresh questions from new angles and append them.
  const moreRef = useRef<Promise<WassceQuestion[]> | null>(null);
  const roundRef = useRef(0);
  const fetchMore = useCallback(() => {
    if (moreRef.current) return moreRef.current;
    if (!user || !subject || !topic) return Promise.resolve([] as WassceQuestion[]);
    const reqId = loadReqRef.current;
    const levelId = level?.id ?? "shs";
    roundRef.current += 1;
    const avoid = questions.slice(-30).map((q) => q.question_text.slice(0, 300));
    const p = runGenerate({
      data: {
        subject,
        topic,
        count: 5,
        tutorName: settings.tutor_name,
        language: settings.language,
        level: levelId,
        ...(gradeRef.current ? { grade: gradeRef.current } : {}),
        avoid,
        round: roundRef.current,
        ...(standard ? { standard } : {}),
      },
    })
      .then((result) => {
        if (reqId !== loadReqRef.current) return [];
        const seen = new Set(questions.map((q) => q.question_text.trim().toLowerCase()));
        const fresh: WassceQuestion[] = result.questions
          .filter((q) => !seen.has(q.question_text.trim().toLowerCase()))
          .map((q) => ({ id: null, subject, topic, year: null, source: "ai", ...q }));
        if (fresh.length) setQuestions((prev) => [...prev, ...fresh]);
        return fresh;
      })
      .catch(() => [] as WassceQuestion[])
      .finally(() => {
        moreRef.current = null;
      });
    moreRef.current = p;
    return p;
  }, [user, subject, topic, level?.id, questions, runGenerate, settings.tutor_name, settings.language, standard]);

  // Prefetch the next batch when the student is near the end.
  useEffect(() => {
    if (questions.length > 0 && index >= questions.length - 2) void fetchMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, questions.length]);

  const next = () => {
    setPicked(null);
    setExplanation(null);
    startedAt.current = Date.now();
    if (index + 1 < questions.length) {
      setIndex(index + 1);
      return;
    }
    setLoading(true);
    void fetchMore().then((fresh) => {
      setLoading(false);
      if (fresh.length) setIndex((i) => i + 1);
      else toast.error("Could not load more questions. Check your network and tap Next again.");
    });
  };

  const explain = async (onReady?: (answer: string) => void) => {
    if (!current) return;
    if (user && locked) {
      toast.error(`Your free trial has ended. Subscribe for ¢${monthlyFee}/month.`);
      return;
    }
    if (!user) {
      toast.error("Please log in to learn with Ama");
      return;
    }
    setExplaining(true);
    try {
      const { answer } = await runAsk({
        data: {
          prompt: `${levelHint}Explain this ${level?.exam ?? "WASSCE"} ${current.subject} question step by step for a Ghanaian student. Question: ${current.question_text}\nOptions: ${JSON.stringify(current.options)}\nCorrect answer: ${current.correct_answer}`,
          tutorName: settings.tutor_name,
          language: settings.language,
          ...(level ? { level: level.id } : {}),
          ...(gradeRef.current ? { grade: gradeRef.current } : {}),
          ...(current.subject ? { subject: current.subject } : {}),
        },
      });
      setExplanation(answer);
      if (onReady) onReady(answer);
      else say(answer);
    } catch (err) {
      setExplanation(current.explanation || null);
      toast.error(err instanceof Error ? err.message : "Ama could not explain right now");
    } finally {
      setExplaining(false);
    }
  };

  // ---------- Hands-free loops ----------
  const [practiceLoop, setPracticeLoop] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [lectureLoop, setLectureLoop] = useState(false);
  const [lectureStart, setLectureStart] = useState<number | null>(null);
  const [lectureMinutes, setLectureMinutes] = useState(0);
  const practiceTokenRef = useRef(0);
  const lectureTokenRef = useRef(0);
  const lectureActiveRef = useRef(false);
  const followUpsRef = useRef<{ question: string; image?: string }[]>([]);
  const askEndRef = useRef<HTMLDivElement>(null);
  const askNearBottomRef = useRef(true);
  useEffect(() => {
    const onScroll = () => {
      askNearBottomRef.current =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 200;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const lectureLoopRef = useRef(false);
  const nextRef = useRef(next);
  nextRef.current = next;

  const sayAsync = useCallback(
    (text: string) => new Promise<void>((resolve) => say(text, resolve)),
    [say],
  );
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  // Keep the screen awake while a loop is running so the phone doesn't stop Ama.
  useEffect(() => {
    if (!practiceLoop && !lectureLoop) return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    void nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => undefined);
    return () => void lock?.release().catch(() => undefined);
  }, [practiceLoop, lectureLoop]);

  const togglePracticeLoop = () => {
    practiceTokenRef.current++;
    setCountdown(0);
    if (practiceLoop) {
      setPracticeLoop(false);
      stopSayRef.current?.();
      setSpeaking(false);
    } else {
      if (picked) next();
      setPracticeLoop(true);
    }
  };

  // Practice loop: question + options → 5s think → correct answer → explanation → next.
  useEffect(() => {
    if (!practiceLoop || loading || !current || picked || !user) return;
    const token = ++practiceTokenRef.current;
    const alive = () => token === practiceTokenRef.current;
    const q = current;
    void (async () => {
      const explanationP = runAsk({
        data: {
          prompt: `${levelHint}Explain this ${level?.exam ?? "WASSCE"} ${q.subject} question step by step for a Ghanaian student. Question: ${q.question_text}\nOptions: ${JSON.stringify(q.options)}\nCorrect answer: ${q.correct_answer}`,
          tutorName: settings.tutor_name,
          language: settings.language,
          ...(level ? { level: level.id } : {}),
          ...(gradeRef.current ? { grade: gradeRef.current } : {}),
          ...(q.subject ? { subject: q.subject } : {}),
        },
      })
        .then((r) => r.answer)
        .catch(() => q.explanation || "");
      const opts = (["A", "B", "C", "D"] as const)
        .filter((k) => q.options?.[k])
        .map((k) => `Option ${k}: ${q.options[k]}.`)
        .join(" ");
      await sayAsync(`Question ${index + 1}. ${q.question_text} ${opts}`);
      for (let s = 5; s > 0; s--) {
        if (!alive()) return;
        setCountdown(s);
        await wait(1000);
      }
      if (!alive()) return;
      setCountdown(0);
      setPicked(q.correct_answer);
      const answerText = q.options?.[q.correct_answer as "A"] ?? "";
      await sayAsync(`The correct answer is Option ${q.correct_answer}: ${answerText}.`);
      if (!alive()) return;
      const answer = await explanationP;
      if (!alive()) return;
      if (answer) {
        setExplanation(answer);
        await sayAsync(cleanTeacherText(answer));
      }
      if (!alive()) return;
      await wait(2000);
      if (!alive()) return;
      nextRef.current();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practiceLoop, loading, current, user?.id]);

  const toggleLectureLoop = () => {
    lectureTokenRef.current++;
    lectureActiveRef.current = false;
    followUpsRef.current = [];
    const on = !lectureLoop;
    lectureLoopRef.current = on;
    setLectureLoop(on);
    if (!on) {
      setLectureStart(null);
      stopSayRef.current?.();
      setSpeaking(false);
    }
  };

  useEffect(() => {
    if (!lectureStart) return;
    const t = setInterval(() => setLectureMinutes(Math.floor((Date.now() - lectureStart) / 60000)), 1000);
    return () => clearInterval(t);
  }, [lectureStart]);

  // Lecture loop: answer first, then keep teaching the whole topic for up to an hour.
  const runLecture = async (question: string, firstAnswer: string) => {
    const token = ++lectureTokenRef.current;
    const alive = () => token === lectureTokenRef.current && lectureLoopRef.current;
    const start = Date.now();
    lectureActiveRef.current = true;
    followUpsRef.current = [];
    setLectureStart(start);
    setLectureMinutes(0);
    await sayAsync(cleanTeacherText(firstAnswer));
    const covered: string[] = [];
    let part = 1;
    // Answer any follow-up questions the student asked, then bridge back to the lesson.
    const handleFollowUps = async () => {
      let answered = false;
      while (alive() && followUpsRef.current.length) {
        const fu = followUpsRef.current.shift()!;
        setAsking(true);
        try {
          const { answer } = await runAsk({
            data: {
              prompt: `${levelHint}You are in the middle of a spoken lecture on the topic of the student's earlier question: "${question}". Parts covered so far: ${covered.join("; ") || "the introduction"}. The student just asked a follow-up question: "${fu.question || "about the photo"}". Answer it clearly and fully in relation to this lesson, with a simple example. Do not continue the main lecture yet. No markdown symbols.`,
              ...(fu.image ? { image: fu.image } : {}),
              tutorName: settings.tutor_name,
              language: settings.language,
              ...(level ? { level: level.id } : {}),
              ...(gradeRef.current ? { grade: gradeRef.current } : {}),
              ...(subject ? { subject } : {}),
            },
          });
          if (!alive()) return;
          setAskThread((t) => [...t, { role: "ama", text: answer }]);
          setAsking(false);
          await sayAsync(cleanTeacherText(answer));
          answered = true;
        } catch {
          setAsking(false);
        }
      }
      if (answered && alive()) {
        const bridge = "Now, let's continue with the main topic.";
        setAskThread((t) => [...t, { role: "ama", text: bridge }]);
        await sayAsync(bridge);
      }
    };
    while (alive() && Date.now() - start < 60 * 60000) {
      await handleFollowUps();
      if (!alive()) break;
      try {
        const { answer } = await runAsk({
          data: {
            prompt: `${levelHint}You are giving a continuous spoken lecture. A student asked: "${question}". Identify the syllabus topic this question belongs to. Write lecture part ${part} on that topic (about 250 words), starting with a short heading line. ${part === 1 ? 'Begin with: "Now, let\'s explore the full topic together."' : ""} Cover new ground only — already covered: ${covered.join("; ") || "nothing yet"}. Progress logically: core ideas, worked examples, exam questions and tips, common mistakes, real Ghanaian applications, then revision summaries. No markdown symbols.`,
            tutorName: settings.tutor_name,
            language: settings.language,
            ...(level ? { level: level.id } : {}),
            ...(gradeRef.current ? { grade: gradeRef.current } : {}),
            ...(subject ? { subject } : {}),
          },
        });
        if (!alive()) break;
        if (followUpsRef.current.length) {
          await handleFollowUps();
          if (!alive()) break;
        }
        covered.push(answer.split("\n")[0]?.slice(0, 80) ?? `part ${part}`);
        setAskThread((t) => [...t, { role: "ama", text: answer }]);
        await sayAsync(cleanTeacherText(answer));
        part++;
      } catch {
        if (!alive()) break;
        await wait(5000);
      }
    }
    if (token !== lectureTokenRef.current) return;
    lectureActiveRef.current = false;
    if (lectureLoopRef.current) {
      const end = "Ayekoo! That wraps up our 1-hour lecture on this topic.";
      setAskThread((t) => [...t, { role: "ama", text: end }]);
      await sayAsync(end);
    }
    lectureLoopRef.current = false;
    setLectureLoop(false);
    setLectureStart(null);
  };

  // Stop loops when the student leaves the page.
  useEffect(
    () => () => {
      practiceTokenRef.current++;
      lectureTokenRef.current++;
      lectureLoopRef.current = false;
    },
    [],
  );

  const onPickFile = async (file: File | undefined) => {
    if (galleryRef.current) galleryRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
    if (!file) return;
    try {
      setAttachment(await fileToImage(file));
    } catch {
      toast.error("Could not open that file. Try another photo.");
    }
  };

  const ask = async () => {
    const question = askInput.trim();
    const image = attachment;
    if (!question && !image) return;
    if (user && locked) {
      toast.error(`Your free trial has ended. Subscribe for ¢${monthlyFee}/month to ask Ama.`);
      void subscribe();
      return;
    }
    if (!user) {
      toast.error("Please log in to learn with Ama");
      return;
    }
    setAskInput("");
    setAttachment(null);
    setAskThread((t) => [...t, { role: "you", text: question, ...(image ? { image } : {}) }]);
    if (lectureActiveRef.current && lectureLoopRef.current) {
      // Follow-up during a lecture: pause speech; the lecture answers it, then resumes.
      followUpsRef.current.push({ question, ...(image ? { image } : {}) });
      stopSayRef.current?.();
      return;
    }
    setAsking(true);
    try {
      const { answer } = await runAsk({
        data: {
          prompt: question ? `${levelHint}${question}` : "",
          ...(image ? { image } : {}),
          tutorName: settings.tutor_name,
          language: settings.language,
          ...(level ? { level: level.id } : {}),
          ...(gradeRef.current ? { grade: gradeRef.current } : {}),
          ...(subject ? { subject } : {}),
        },
      });
      setAskThread((t) => [...t, { role: "ama", text: answer }]);
      if (lectureLoopRef.current) void runLecture(question || "the topic in the photo", answer);
      else say(answer);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ama could not answer right now");
    } finally {
      setAsking(false);
    }
  };

  const subscribe = async () => {
    if (!user?.email) return;
    const reference = `tutor-${Date.now()}`;
    const paid = await payWithPaystack({
      email: user.email,
      amount: monthlyFee,
      reference,
    }).catch(() => false);
    if (!paid) return;
    await startSubscription(user.id, monthlyFee, reference);
    setSubscribedUntil(new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString());
    toast.success("Unlimited tutoring unlocked for 30 days");
  };

  const answerCheck = async (status: "understood" | "confused") => {
    if (!user || !pendingCheck) return;
    const check = pendingCheck;
    setPendingCheck(null);
    await logUnderstanding({ userId: user.id, classId: check.class_id, topic: check.topic, status });
    const matching = SUBJECTS.find((s) => s.topics.includes(check.topic));
    if (matching) {
      setSubject(matching.name);
      setTopic(check.topic);
    } else {
      void loadQuestions(subject, check.topic);
    }
    if (status === "confused") {
      setTab("ask");
      setAskThread((t) => [...t, { role: "you", text: `I did not understand ${check.topic}` }]);
      setAsking(true);
      try {
        const { answer } = await runAsk({
          data: {
            prompt: `A student did not understand today's live class on "${check.topic}". Re-explain it simply, step by step, with a Ghanaian example, then give one easy WASSCE question on it.`,
            tutorName: settings.tutor_name,
            language: settings.language,
          },
        });
        setAskThread((t) => [...t, { role: "ama", text: answer }]);
        say(answer);
      } finally {
        setAsking(false);
      }
    } else {
      setTab("practice");
      toast.success(`Great! Answer 3 quick questions on ${check.topic}`);
    }
  };

  const percent = scores.total ? Math.round((scores.correct / scores.total) * 100) : 0;

  return (
    <AppShell hideNavigation>
      <header className="flex items-center gap-3 px-5 pt-6">
        <AmaAvatar src={settings.avatar_url} name={settings.tutor_name} speaking={speaking} size="sm" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">{settings.tutor_name} — AI Tutor</h1>
          <p className="truncate text-xs text-muted-foreground">
            {level ? level.blurb : "Always active · voice or text"}
          </p>
        </div>
      </header>

      {level?.id === "kids" ? (
        <KidsWordTracer onBack={() => setLevel(null)} />
      ) : !level ? (
        <section className="px-5 py-6">
          <p className="text-sm text-muted-foreground">{settings.greeting}</p>
          <h2 className="mt-5 text-sm font-semibold">Choose your class</h2>
          <div className="mt-3 space-y-3">
            {CLASS_LEVELS.map((lv) => (
              <button
                key={lv.id}
                type="button"
                onClick={() => pickLevel(lv)}
                className="flex w-full items-center justify-between rounded-2xl border border-border bg-surface px-4 py-4 text-left"
              >
                <span className="min-w-0">
                  <span className="block font-display text-base font-bold">{lv.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{lv.blurb}</span>
                  <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                    {lv.subjects.map((s) => s.name.replace(/\s*\(.*\)$/, "")).join(" · ")}
                  </span>
                </span>
                <ChevronRight className="ml-3 size-5 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
          <p className="mt-5 text-xs text-muted-foreground">
            After you pick a class, you can practise questions, ask {settings.tutor_name} anything
            and follow your scores.
          </p>
        </section>
      ) : (
        <>
      <section className="px-5 py-3">
        <p className="text-sm text-muted-foreground">{settings.greeting}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {unlimited
            ? "Unlimited practice is active"
            : `${Math.max(0, FREE_QUESTIONS_PER_DAY - scores.todayCount)} free questions left today`}
        </p>
      </section>

      <div className="flex items-center gap-2 px-5">
        <Button size="sm" variant="ghost" className="gap-1 px-2" onClick={() => setLevel(null)}>
          <ArrowLeft className="size-4" /> Classes
        </Button>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          {level.label} · {level.exam}
        </span>
      </div>

      {GRADE_OPTIONS[level.id] ? (
        <section className="mx-5 mt-3 rounded-2xl border border-border bg-surface p-3">
          <label htmlFor="tutor-grade" className="text-xs font-semibold">
            Which class lesson do you want?
          </label>
          <div className="mt-2 flex gap-2">
            <select
              id="tutor-grade"
              value={draftGrade}
              onChange={(e) => setDraftGrade(e.target.value)}
              className="h-10 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-sm"
            >
              {(GRADE_OPTIONS[level.id] ?? []).map((g) => (
                <option key={g.code} value={g.code}>
                  {g.label}
                </option>
              ))}
            </select>
            <Button size="sm" className="h-10" disabled={!draftGrade || draftGrade === activeGrade} onClick={updateGrade}>
              Update
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {activeGrade
              ? `Learning: ${GRADE_OPTIONS[level.id]?.find((g) => g.code === activeGrade)?.label ?? activeGrade}`
              : "Pick your class and tap Update"}
          </p>
        </section>
      ) : null}

      {pendingCheck ? (
        <section className="mx-5 my-4 rounded-2xl border border-primary/40 bg-primary/5 p-4">
          <p className="text-sm">
            Teacher just ended the class on <strong>{pendingCheck.topic}</strong>. Did you understand
            everything?
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" className="gap-1" onClick={() => void answerCheck("understood")}>
              <Check className="size-4" /> I understand
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => void answerCheck("confused")}>
              <X className="size-4" /> I&apos;m confused
            </Button>
          </div>
        </section>
      ) : null}

      <nav className="mt-3 flex gap-2 px-5">
        {(["practice", "ask", "scores"] as Tab[]).map((t) => (
          <Button
            key={t}
            size="sm"
            variant={tab === t ? "default" : "outline"}
            className="capitalize"
            onClick={() => setTab(t)}
          >
            {t === "ask" ? `Ask ${settings.tutor_name}` : t}
          </Button>
        ))}
      </nav>


      {tab === "practice" ? (
        <section className="px-5 py-5">
          {level?.id === "others" && user ? (
            <OthersPicker
              saved={othersPrefs}
              onSave={(next) => {
                saveOthersPrefs(user.id, next);
                setOthersPrefs(next);
                toast.success("Field and accreditation saved");
              }}
            />
          ) : null}
          <SubjectTopicPicker
            subjects={levelSubjects}
            topics={topics}
            subject={subject}
            topic={topic}
            onSubject={(name) => {
              setSubject(name);
              setTopic(levelSubjects.find((s) => s.name === name)?.topics[0] ?? "");
            }}
            onTopic={setTopic}
          />
          {isAdmin && level ? <ManageSubjects levelId={level.id} subjects={levelSubjects} /> : null}
          {user && !locked ? (
            <div className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2">
              <p className="text-xs text-muted-foreground">
                {practiceLoop
                  ? countdown > 0
                    ? `Thinking time: ${countdown}s…`
                    : "Loop on — Ama is reading hands-free"
                  : "Loop: Ama reads questions, answers and explanations aloud"}
              </p>
              <Button
                size="sm"
                variant={practiceLoop ? "destructive" : "outline"}
                className="gap-1"
                onClick={togglePracticeLoop}
              >
                {practiceLoop ? <Square className="size-4" /> : <Repeat className="size-4" />}
                {practiceLoop ? "Unloop" : "Loop"}
              </Button>
            </div>
          ) : null}

          {!user ? (
            <div className="mt-6 rounded-2xl border border-border bg-surface p-5 text-center">
              <p className="text-sm">Log in to practise with {settings.tutor_name}.</p>
              <Button asChild className="mt-4 w-full">
                <Link to="/auth">Log in</Link>
              </Button>
            </div>
          ) : locked ? (
            <div className="mt-6 rounded-2xl border border-border bg-surface p-5 text-center">
              <p className="text-sm">
                Your 60-day free trial has ended. Subscribe to keep using Practice and Ask Ama.
              </p>
              <Button className="mt-4 w-full" onClick={() => void subscribe()}>
                Unlimited tutoring for ¢{monthlyFee}/month
              </Button>
            </div>
          ) : loading ? (
            <div className="mt-8 flex justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : current ? (
            <article className="mt-5 rounded-2xl border border-border bg-surface p-5">
              <p className="text-xs text-muted-foreground">
                {current.subject} · {current.topic}
                {current.year ? ` · WASSCE ${current.year}` : ""}
              </p>
              <p className="mt-2 text-sm font-medium leading-relaxed">{current.question_text}</p>
              <div className="mt-4 space-y-2">
                {(["A", "B", "C", "D"] as const).map((key) => {
                  const text = current.options?.[key];
                  if (!text) return null;
                  const isAnswer = key === current.correct_answer;
                  const wrongPick = Boolean(picked) && picked === key && !isAnswer;
                  // Correct is always green, the student's wrong choice is red.
                  const state = !picked
                    ? "border-border"
                    : isAnswer
                      ? "border-success bg-success/15 text-success"
                      : wrongPick
                        ? "border-destructive bg-destructive/15 text-destructive"
                        : "border-border opacity-60";
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`flex w-full items-center gap-2 rounded-xl border px-4 py-3 text-left text-sm ${state}`}
                      onClick={() => void choose(key)}
                      disabled={Boolean(picked)}
                    >
                      <span className="font-semibold">{key}.</span>
                      <span className="flex-1">{text}</span>
                      {picked && isAnswer ? <Check className="size-4 shrink-0" /> : null}
                      {wrongPick ? <X className="size-4 shrink-0" /> : null}
                    </button>
                  );
                })}
              </div>
              {picked ? (
                <div className="mt-4 space-y-3">
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => void explain()} disabled={explaining}>
                      {explaining ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                      Explain with {settings.tutor_name}
                    </Button>
                    <Button size="sm" onClick={next}>
                      Next question
                    </Button>
                  </div>
                  {explanation ? (
                    <LongPressPlay onPlay={() => say(cleanTeacherText(explanation))}>
                      <div className="whitespace-pre-wrap rounded-xl bg-muted p-3 font-mono text-sm leading-relaxed">
                        <TeacherText text={explanation} renderText={cleanTeacherText} />
                      </div>
                    </LongPressPlay>
                  ) : null}
                </div>
              ) : null}
            </article>
          ) : (
            <p className="mt-6 text-sm text-muted-foreground">No questions for this topic yet.</p>
          )}
        </section>
      ) : null}

      {tab === "ask" ? (
        <section className="px-5 pt-5">
          <div className="space-y-3">
            {askThread.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ask {settings.tutor_name} anything about your WASSCE subjects.
              </p>
            ) : null}
            {askThread.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "you"
                    ? "ml-auto max-w-[85%] rounded-2xl bg-primary p-1.5 text-sm text-primary-foreground"
                    : "max-w-[92%] whitespace-pre-wrap text-sm leading-relaxed"
                }
              >
                {m.image ? (
                  <img src={m.image} alt="Your photo" className="max-h-64 w-full rounded-xl object-cover" />
                ) : null}
                {m.text && m.role === "ama" ? (
                  <LongPressPlay onPlay={() => say(cleanTeacherText(m.text))}>
                    <div>
                      <TeacherText text={m.text} renderText={cleanTeacherText} />
                    </div>
                  </LongPressPlay>
                ) : m.text ? (
                  <p className="px-2.5 py-1">{m.text}</p>
                ) : null}
              </div>
            ))}
            {asking ? <Loader2 className="size-5 animate-spin text-muted-foreground" /> : null}
            <div ref={askEndRef} className="h-40 scroll-mb-40" />
          </div>
          {attachment ? (
            <div className="relative mt-4 w-fit">
              <img src={attachment} alt="Photo to send" className="max-h-40 rounded-xl border border-border" />
              <button
                type="button"
                onClick={() => setAttachment(null)}
                className="absolute -right-2 -top-2 rounded-full bg-background p-1 shadow"
                aria-label="Remove photo"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : null}
          <input
            ref={galleryRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => void onPickFile(e.target.files?.[0])}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*,video/*"
            capture="environment"
            className="hidden"
            onChange={(e) => void onPickFile(e.target.files?.[0])}
          />
          <div className="sticky bottom-0 z-[61] -mx-5 mt-3 border-t border-border bg-background px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {user && !locked ? (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-1.5">
              <p className="min-w-0 truncate text-xs text-muted-foreground">
                {lectureLoop
                  ? lectureStart
                    ? `Lecture Time: ${lectureMinutes}m / 60m`
                    : "Lecture Loop on — ask a question to start"
                  : "Lecture Loop: up to 1 hour of teaching"}
              </p>
              <Button
                size="sm"
                variant={lectureLoop ? "destructive" : "outline"}
                className="shrink-0 gap-1"
                onClick={toggleLectureLoop}
              >
                {lectureLoop ? <Square className="size-4" /> : <Repeat className="size-4" />}
                {lectureLoop ? "Stop Lecture" : "Lecture Loop"}
              </Button>
            </div>
          ) : null}
          <div className="flex items-end gap-1.5">
            <Button size="icon" variant="ghost" onClick={() => galleryRef.current?.click()} aria-label="Upload photo or video">
              <Paperclip className="size-5" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => cameraRef.current?.click()} aria-label="Open camera">
              <Camera className="size-5" />
            </Button>
            <Input
              value={askInput}
              placeholder={attachment ? "Add a message (optional)…" : `Ask ${settings.tutor_name}…`}
              onChange={(e) => setAskInput(e.target.value)}
            />
            <Button size="icon" onClick={() => void ask()} disabled={asking} aria-label="Send question">
              <Send className="size-4" />
            </Button>
          </div>
          </div>
        </section>
      ) : null}

      {tab === "scores" ? (
        <section className="px-5 py-5">
          <div className="rounded-2xl border border-border bg-surface p-5">
            <p className="text-sm text-muted-foreground">Overall score</p>
            <p className="text-3xl font-semibold">{percent}%</p>
            <p className="mt-1 text-sm">
              Predicted WASSCE grade: <strong>{predictedGrade(percent)}</strong>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {scores.correct} correct out of {scores.total} questions
            </p>
          </div>
          <h2 className="mt-5 text-sm font-semibold">Monthly report card</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Graded A1 to F9 the Ghana Education Service way. Scroll down for older months.
          </p>
          <div className="mt-3 max-h-[22rem] overflow-y-auto rounded-2xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Month</th>
                  <th className="px-4 py-2 font-medium">Subject</th>
                  <th className="px-4 py-2 text-right font-medium">Score</th>
                  <th className="px-4 py-2 text-right font-medium">Grade</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((m) =>
                  m.subjects.map((s, i) => (
                    <tr key={`${m.month}-${s.subject}`} className="border-t border-border">
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {i === 0 ? m.label : ""}
                      </td>
                      <td className="px-4 py-2">{s.subject}</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">{s.percent}%</td>
                      <td className="px-4 py-2 text-right font-semibold">{s.grade}</td>
                    </tr>
                  )),
                )}
                {monthly.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-4 text-sm text-muted-foreground">
                      Answer some questions to start this month&apos;s record.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <h2 className="mt-5 text-sm font-semibold">Weak areas</h2>
          <ul className="mt-2 space-y-2">
            {scores.byTopic.slice(0, 8).map((t) => (
              <li
                key={t.topic}
                className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-2 text-sm"
              >
                <span>{t.topic}</span>
                <span className="text-muted-foreground">
                  {Math.round((t.correct / t.total) * 100)}%
                </span>
              </li>
            ))}
            {scores.byTopic.length === 0 ? (
              <li className="text-sm text-muted-foreground">Answer some questions to see your scores.</li>
            ) : null}
          </ul>
        </section>
      ) : null}
        </>
      )}
    </AppShell>
  );
}

const CUSTOM = "__custom__";

interface OthersPrefs {
  field: string;
  accreditation: string;
}
const TERTIARY_FIELDS = [
  "University",
  "Teacher Training (College of Education)",
  "Nursing Training",
  "Midwifery Training",
  "Technical University",
  "Polytechnic",
  "Health Assistant Training",
  "Agricultural College",
  "Professional Institute (ICAG, CIMG, etc.)",
];
const ACCREDITATIONS = ["N&MC", "GTEC"];
const othersKey = (uid: string) => `findmit-others-prefs:${uid}`;
function readOthersPrefs(uid: string): OthersPrefs {
  try {
    const v = JSON.parse(window.localStorage.getItem(othersKey(uid)) ?? "null") as OthersPrefs | null;
    return { field: v?.field ?? "", accreditation: v?.accreditation === "MMC" ? "N&MC" : v?.accreditation ?? "" };
  } catch {
    return { field: "", accreditation: "" };
  }
}
function saveOthersPrefs(uid: string, p: OthersPrefs) {
  window.localStorage.setItem(othersKey(uid), JSON.stringify(p));
}
function accreditationRule(p: OthersPrefs) {
  const body =
    p.accreditation === "GTEC"
      ? "GTEC (Ghana Tertiary Education Commission) accreditation and curriculum requirements for Ghanaian tertiary institutions"
      : p.accreditation === "N&MC"
        ? "N&MC (Nursing and Midwifery Council of Ghana) accreditation, licensing and curriculum requirements in Ghana"
        : `${p.accreditation} requirements in Ghana`;
  return `The student studies ${p.field || "a tertiary programme"} in Ghana. Every answer and every question MUST match exactly the ${body}. Use the content, standards, terminology and exam style that body requires; do not use WASSCE or BECE standards.`;
}

function OthersPicker({ saved, onSave }: { saved: OthersPrefs; onSave: (p: OthersPrefs) => void }) {
  const [field, setField] = useState(saved.field);
  const [acc, setAcc] = useState(saved.accreditation);
  useEffect(() => {
    setField(saved.field);
    setAcc(saved.accreditation);
  }, [saved]);
  const changed = field !== saved.field || acc !== saved.accreditation;
  return (
    <div className="mb-3 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <PickBox label="FIELD" placeholder="Type your field" options={TERTIARY_FIELDS} value={field} onChange={setField} />
        <div className="rounded-2xl border border-border bg-surface p-3">
          <p className="text-[11px] font-bold tracking-wide text-muted-foreground">ACCREDITATION</p>
          <select
            className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            value={acc}
            onChange={(e) => setAcc(e.target.value)}
          >
            <option value="">Choose…</option>
            {ACCREDITATIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      </div>
      <Button className="w-full" disabled={!field || !acc || !changed} onClick={() => onSave({ field, accreditation: acc })}>
        Update
      </Button>
      {saved.accreditation ? (
        <p className="text-xs text-muted-foreground">
          Saved: {saved.field} · {saved.accreditation}. Ama follows {saved.accreditation} requirements in this class.
        </p>
      ) : null}
    </div>
  );
}

function SubjectTopicPicker(props: {
  subjects: { name: string; topics: string[] }[];
  topics: string[];
  subject: string;
  topic: string;
  onSubject: (v: string) => void;
  onTopic: (v: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <PickBox
        label="SUBJECTS"
        placeholder="Type a subject"
        options={props.subjects.map((s) => s.name)}
        value={props.subject}
        onChange={props.onSubject}
      />
      <PickBox
        label="TOPICS"
        placeholder="Type a topic"
        options={props.topics}
        value={props.topic}
        onChange={props.onTopic}
      />
    </div>
  );
}

function PickBox(props: {
  label: string;
  placeholder: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const inList = props.options.includes(props.value);
  const submit = () => {
    const v = text.trim();
    if (!v) return;
    props.onChange(v);
    setTyping(false);
    setText("");
  };
  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <p className="text-[11px] font-bold tracking-wide text-muted-foreground">{props.label}</p>
      {typing ? (
        <div className="mt-2 flex gap-2">
          <Input
            autoFocus
            value={text}
            placeholder={props.placeholder}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <Button size="sm" onClick={submit}>Set</Button>
          <Button size="sm" variant="ghost" onClick={() => setTyping(false)} aria-label="Cancel">
            <X className="size-4" />
          </Button>
        </div>
      ) : (
        <select
          className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          value={inList ? props.value : props.value ? props.value : ""}
          onChange={(e) => {
            if (e.target.value === CUSTOM) setTyping(true);
            else props.onChange(e.target.value);
          }}
        >
          {!props.value ? <option value="">Choose…</option> : null}
          {!inList && props.value ? <option value={props.value}>{props.value}</option> : null}
          {props.options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
          <option value={CUSTOM}>✏️ Type my own…</option>
        </select>
      )}
    </div>
  );
}

function ManageSubjects({ levelId, subjects }: { levelId: string; subjects: { name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [topicText, setTopicText] = useState("");
  const [busy, setBusy] = useState(false);
  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await addLevelSubject(levelId, name.trim(), topicText.split(",").map((t) => t.trim()).filter(Boolean));
      toast.success("Subject added");
      setName("");
      setTopicText("");
    } catch {
      toast.error("Could not add subject");
    } finally {
      setBusy(false);
    }
  };
  const remove = async (n: string) => {
    if (!confirm(`Remove ${n} from this class?`)) return;
    try {
      await removeLevelSubject(levelId, n);
      toast.success("Subject removed");
    } catch {
      toast.error("Could not remove subject");
    }
  };
  return (
    <div className="mt-3">
      <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
        {open ? "Close" : "Manage subjects (admin)"}
      </Button>
      {open ? (
        <div className="mt-3 space-y-3 rounded-2xl border border-border bg-surface p-3">
          <ul className="space-y-1">
            {subjects.map((s) => (
              <li key={s.name} className="flex items-center justify-between text-sm">
                <span className="truncate">{s.name}</span>
                <Button size="sm" variant="ghost" onClick={() => void remove(s.name)} aria-label={`Remove ${s.name}`}>
                  <X className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
          <Input placeholder="New subject name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            placeholder="Topics, separated by commas"
            value={topicText}
            onChange={(e) => setTopicText(e.target.value)}
          />
          <Button size="sm" className="w-full" disabled={busy} onClick={() => void add()}>
            Add subject
          </Button>
        </div>
      ) : null}
    </div>
  );
}
