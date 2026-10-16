import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { AmaAvatar } from "@/components/tutor/AmaAvatar";
import { askTutor, generateQuestions } from "@/lib/tutor.functions";
import {
  SUBJECTS,
  fetchPastQuestions,
  fetchPendingClassCheck,
  logUnderstanding,
  recordAttempt,
  saveGeneratedQuestion,
  updateUnderstandingScore,
  useTutorSettings,
  type PendingClassCheck,
  type WassceQuestion,
} from "@/lib/tutor";

type Line = { from: "ama" | "me"; text: string };

/** Ama pops into FindMit chat right after a joined live class ends. */
export function AmaClassCheck({ userId }: { userId: string }) {
  const { settings } = useTutorSettings();
  const runAsk = useServerFn(askTutor);
  const runGenerate = useServerFn(generateQuestions);
  const [check, setCheck] = useState<PendingClassCheck | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<"ask" | "quiz" | "done">("ask");
  const [quiz, setQuiz] = useState<WassceQuestion[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [hidden, setHidden] = useState(false);

  const load = useCallback(() => {
    void fetchPendingClassCheck(userId).then((c) => {
      setCheck((prev) => (prev?.class_id === c?.class_id ? prev : c));
    });
  }, [userId]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`ama-class-check-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_classes" }, (p) => {
        const row = p.new as { is_live?: boolean };
        if (row.is_live === false) load();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  useEffect(() => {
    if (!check) return;
    setStage("ask");
    setHidden(false);
    setLines([
      {
        from: "ama",
        text: `Akwaaba! 👋 Teacher just ended today's class on "${check.topic}". Did you understand the lesson? Are you okay, or do you need more explanation?`,
      },
    ]);
  }, [check]);

  const subjectFor = (topic: string) =>
    SUBJECTS.find((s) => s.topics.includes(topic))?.name ?? "General Studies";

  const loadQuiz = async (topic: string, count: number) => {
    const subject = subjectFor(topic);
    let list = (await fetchPastQuestions(subject, topic, count)).slice(0, count);
    if (list.length < count) {
      const { questions } = await runGenerate({
        data: { subject, topic, count: count - list.length, tutorName: settings.tutor_name, language: settings.language },
      });
      const made = await Promise.all(
        questions.map(async (q) => ({
          ...q,
          subject,
          topic,
          year: null,
          source: "ai",
          id: await saveGeneratedQuestion({ ...q, subject, topic }, userId),
        })),
      );
      list = [...list, ...made];
    }
    return list;
  };

  const answerFeeling = async (status: "understood" | "confused") => {
    if (!check) return;
    setBusy(true);
    setLines((l) => [...l, { from: "me", text: status === "understood" ? "Yes, I understood 🟢" : "I'm confused 🟡" }]);
    try {
      await logUnderstanding({ userId, classId: check.class_id, topic: check.topic, status });
      if (status === "confused") {
        const { answer } = await runAsk({
          data: {
            prompt: `A student did not understand today's live class on "${check.topic}". Re-explain it simply, step by step, with a Ghanaian example. Keep it short.`,
            tutorName: settings.tutor_name,
            language: settings.language,
          },
        });
        setLines((l) => [...l, { from: "ama", text: answer }, { from: "ama", text: "No wahala! Try this easy past question:" }]);
        setQuiz(await loadQuiz(check.topic, 1));
      } else {
        setLines((l) => [...l, { from: "ama", text: "Ehe! Let's test you with 3 quick past questions 💪" }]);
        setQuiz(await loadQuiz(check.topic, 3));
      }
      setQIndex(0);
      setScore(0);
      setStage("quiz");
    } catch (err) {
      setLines((l) => [...l, { from: "ama", text: err instanceof Error ? err.message : "I could not answer right now." }]);
    } finally {
      setBusy(false);
    }
  };

  const pick = async (letter: string) => {
    const q = quiz[qIndex];
    if (!q || !check) return;
    const correct = letter === q.correct_answer;
    const nextScore = score + (correct ? 1 : 0);
    setScore(nextScore);
    setLines((l) => [
      ...l,
      { from: "me", text: `${letter}. ${q.options[letter] ?? ""}` },
      { from: "ama", text: correct ? `Correct! ✅ ${q.explanation}` : `Not quite ❌ The answer is ${q.correct_answer}. ${q.explanation}` },
    ]);
    void recordAttempt({
      userId,
      questionId: q.id,
      subject: q.subject,
      topic: q.topic,
      selected: letter,
      isCorrect: correct,
      seconds: 0,
    }).catch(() => undefined);
    if (qIndex + 1 < quiz.length) {
      setQIndex(qIndex + 1);
    } else {
      setStage("done");
      await updateUnderstandingScore(userId, check.class_id, nextScore).catch(() => undefined);
      setLines((l) => [...l, { from: "ama", text: `You scored ${nextScore}/${quiz.length}. Keep practising with me in the Tutor anytime! 📚` }]);
    }
  };

  if (!check || hidden) return null;
  const q = stage === "quiz" ? quiz[qIndex] : null;

  return (
    <section className="m-2 rounded-2xl border border-primary/40 bg-card p-3 shadow-sm">
      <header className="mb-2 flex items-center gap-2">
        <AmaAvatar src={settings.avatar_url} name={settings.tutor_name} size="sm" speaking={busy} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{settings.tutor_name} · WASSCE Tutor</p>
          <p className="text-xs text-muted-foreground">After-class check</p>
        </div>
        <Button variant="ghost" size="icon" className="size-8 rounded-full" aria-label="Close" onClick={() => setHidden(true)}>
          <X className="size-4" />
        </Button>
      </header>
      <div className="max-h-72 space-y-2 overflow-y-auto">
        {lines.map((line, i) => (
          <p
            key={i}
            className={`w-fit max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
              line.from === "me" ? "ml-auto bg-primary text-primary-foreground" : "bg-muted text-foreground"
            }`}
          >
            {line.text}
          </p>
        ))}
        {q ? (
          <div className="rounded-xl bg-muted p-3 text-sm">
            <p className="mb-2 font-medium">{q.question_text}</p>
            <div className="grid gap-1.5">
              {Object.entries(q.options).map(([k, v]) => (
                <Button key={k} variant="outline" size="sm" className="h-auto justify-start whitespace-normal text-left" onClick={() => void pick(k)}>
                  {k}. {v}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        {busy ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
      </div>
      {stage === "ask" && !busy ? (
        <div className="mt-3 flex gap-2">
          <Button size="sm" className="flex-1" onClick={() => void answerFeeling("understood")}>I understood</Button>
          <Button size="sm" variant="outline" className="flex-1" onClick={() => void answerFeeling("confused")}>I'm confused</Button>
        </div>
      ) : null}
    </section>
  );
}
