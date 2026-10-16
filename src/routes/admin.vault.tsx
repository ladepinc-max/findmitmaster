import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, BookOpen, Database, FileUp, Loader2, RefreshCw, Search, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRole } from "@/lib/roles";
import { addVaultEntries, indexVault, previewVaultSearch, type VaultEntry } from "@/lib/vault.functions";
import {
  VAULT_LEVELS,
  deleteVaultRow,
  fetchVaultRows,
  fetchVaultSummary,
  parseCurriculumFile,
  pdfToVaultEntries,
  type VaultLevelId,
  type VaultRow,
  type VaultSummary,
} from "@/lib/vault";

export const Route = createFileRoute("/admin/vault")({
  head: () => ({
    meta: [
      { title: "FindMit Vault — Admin" },
      {
        name: "description",
        content: "Load textbooks and past questions for Kids, Basic, JHS, SHS and Tertiary classes that Ama teaches from.",
      },
      { property: "og:title", content: "FindMit Vault — Admin" },
      { property: "og:description", content: "The class-by-class study material the FindMit tutor uses." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminVault,
});

type Chunk = {
  id: string;
  subject: string;
  grade: string;
  strand: string | null;
  sub_strand: string | null;
  indicator: string | null;
  content: string;
  source_type: string;
  similarity: number;
};

type Kind = "textbook" | "past";

function AdminVault() {
  const { role, loading } = useRole();
  const runAdd = useServerFn(addVaultEntries);
  const runIndex = useServerFn(indexVault);
  const runPreview = useServerFn(previewVaultSearch);

  const [levelId, setLevelId] = useState<VaultLevelId>("jhs");
  const level = useMemo(() => VAULT_LEVELS.find((l) => l.id === levelId)!, [levelId]);
  const [kind, setKind] = useState<Kind>("textbook");
  const [summary, setSummary] = useState<VaultSummary | null>(null);
  const [rows, setRows] = useState<VaultRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState("");

  const [subject, setSubject] = useState(level.subjects[0] ?? "");
  const [grade, setGrade] = useState<string>("auto");
  const [pdf, setPdf] = useState<File | null>(null);

  const [content, setContent] = useState("");
  const [sourceText, setSourceText] = useState("");

  const [question, setQuestion] = useState("");
  const [chunks, setChunks] = useState<Chunk[] | null>(null);

  useEffect(() => {
    setSubject(level.subjects[0] ?? "");
    setGrade("auto");
    setChunks(null);
  }, [level]);

  const reload = useCallback(async () => {
    const [s, r] = await Promise.all([
      fetchVaultSummary(levelId).catch(() => null),
      fetchVaultRows(levelId, kind).catch(() => []),
    ]);
    setSummary(s);
    setRows(r);
  }, [levelId, kind]);

  useEffect(() => {
    if (role === "admin") void reload();
  }, [role, reload]);

  /** Saves pieces in batches. They stay hidden from Ama until "Update AI tutor" is tapped. */
  const save = async (entries: VaultEntry[]) => {
    let added = 0;
    for (let i = 0; i < entries.length; i += 50) {
      const res = await runAdd({ data: { entries: entries.slice(i, i + 50) } });
      added += res.added;
      setProgress(`Saved ${added} of ${entries.length}…`);
    }
    return added;
  };

  /** Publishes every pending piece so Ama can teach from it. */
  const updateTutor = async () => {
    setBusy("publish");
    try {
      for (let guard = 0; guard < 200; guard++) {
        const res = await runIndex({ data: { limit: 500 } });
        if (res.indexed === 0 || res.remaining === 0) break;
        setProgress(`Updating Ama… ${res.remaining} left`);
      }
      toast.success("AI tutor updated — Ama can now use the new material");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(null);
      setProgress("");
    }
  };

  const pending = (summary?.total ?? 0) - (summary?.indexed ?? 0);

  /** Fingerprint of a bundle file — changes only when the file gets new content. */
  const fingerprint = (text: string) => {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
    return `${text.length}-${h.toString(36)}`;
  };
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const files: Array<[string, string]> = [
      ["official", "/vault/nacca-b1-b9.json"],
      ["official-shs", "/vault/nacca-shs.json"],
    ];
    void Promise.all(
      files.map(async ([tag, file]) => {
        try {
          const fp = fingerprint(await (await fetch(file)).text());
          return [tag, localStorage.getItem(`vault_loaded_${tag}`) === fp] as const;
        } catch {
          return [tag, false] as const;
        }
      }),
    ).then((r) => setLoaded(Object.fromEntries(r)));
  }, []);

  /** Loads an official NaCCA curriculum bundle (every class and subject) into the vault. */
  const loadOfficial = async (file = "/vault/nacca-b1-b9.json", label = "Basic 1–9", tag = "official") => {
    if (loaded[tag]) return;
    if (!window.confirm(`Load the official NaCCA ${label} curriculum into the vault? Only do this once.`)) return;
    setBusy(tag as typeof busy);
    try {
      const res = await fetch(file);
      const text = await res.text();
      const entries = JSON.parse(text) as VaultEntry[];
      const added = await save(entries);
      localStorage.setItem(`vault_loaded_${tag}`, fingerprint(text));
      setLoaded((s) => ({ ...s, [tag]: true }));
      toast.success(`Load complete: ${added} official syllabus pieces for ${label}. Tap "Update AI tutor" so Ama can use them.`);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load the curriculum");
    } finally {
      setBusy(null);
      setProgress("");
    }
  };


  const update = async () => {
    if (!pdf) {
      toast.error("Pick a PDF first");
      return;
    }
    setBusy("update");
    try {
      let entries: VaultEntry[];
      if (pdf.name.toLowerCase().endsWith(".json")) {
        entries = parseCurriculumFile(await pdf.text()).entries;
      } else {
        entries = await pdfToVaultEntries(pdf, { level: levelId, subject, grade, kind }, (p, t) =>
          setProgress(`Reading page ${p} of ${t}…`),
        );
      }
      if (entries.length === 0) throw new Error("No readable text was found in that file");
      const added = await save(entries);
      toast.success(`${added} new pieces saved. Tap "Update AI tutor" so Ama can use them.`);
      setPdf(null);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That file could not be loaded");
    } finally {
      setBusy(null);
      setProgress("");
    }
  };

  const addOne = async () => {
    if (content.trim().length < 3) {
      toast.error("Please write the question or note first");
      return;
    }
    setBusy("add");
    try {
      await save([
        {
          level: levelId,
          subject,
          grade: grade === "auto" ? "ALL" : grade,
          strand: null,
          sub_strand: null,
          indicator: null,
          content: content.trim(),
          source_text: sourceText.trim() || null,
          source_type: kind === "past" ? (levelId === "jhs" ? "bece_past_question" : "past_question") : "textbook",
        },
      ]);
      toast.success("Added to the vault — tap \"Update AI tutor\" so Ama can use it");
      setContent("");
      setSourceText("");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add that");
    } finally {
      setBusy(null);
      setProgress("");
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteVaultRow(id);
      setRows((r) => r.filter((x) => x.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove");
    }
  };

  const test = async () => {
    if (question.trim().length < 2) return;
    setBusy("test");
    try {
      const res = await runPreview({ data: { question: question.trim(), grade: null, subject: null, level: levelId } });
      setChunks(res.chunks as Chunk[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Search failed");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  if (role !== "admin") return <NotAdminRedirect />;

  const selectCls = "h-10 w-full rounded-lg border border-border bg-background px-2 text-sm";

  return (
    <AppShell>
      <main className="mx-auto max-w-lg pb-24">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur">
          <Link to="/settings" aria-label="Back" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="font-display text-base font-bold">FindMit Vault</h1>
        </header>

        <section className="px-5 pt-5">
          <Label htmlFor="v-level">Class vault to edit</Label>
          <select
            id="v-level"
            value={levelId}
            onChange={(e) => setLevelId(e.target.value as VaultLevelId)}
            className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm font-semibold"
          >
            {VAULT_LEVELS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <Stat value={summary?.total} label="Pieces" />
            <Stat value={summary?.indexed} label="Ready for Ama" />
            <Stat value={summary?.bySubject.length} label="Subjects" />
          </div>
          <button
            type="button"
            onClick={() => void loadOfficial()}
            disabled={busy !== null || loaded["official"]}
            className="mt-3 h-11 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy === "official" ? progress || "Loading…" : loaded["official"] ? "✓ Load complete — Basic 1–9 curriculum" : "Load official NaCCA Basic 1–9 curriculum"}
          </button>
          <button
            type="button"
            onClick={() => void loadOfficial("/vault/nacca-shs.json", "SHS 1–3", "official-shs")}
            disabled={busy !== null || loaded["official-shs"]}
            className="mt-2 h-11 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy === "official-shs" ? progress || "Loading…" : loaded["official-shs"] ? "✓ Load complete — SHS 1–3 curriculum" : "Load official NaCCA SHS 1–3 curriculum"}
          </button>

          <button
            type="button"
            onClick={() => void updateTutor()}
            disabled={busy !== null || pending <= 0}
            className="mt-2 h-11 w-full rounded-xl bg-accent text-sm font-semibold text-accent-foreground disabled:opacity-60"
          >
            {busy === "publish"
              ? progress || "Updating…"
              : pending > 0
                ? `Update AI tutor — ${pending} new piece${pending === 1 ? "" : "s"} waiting`
                : "✓ AI tutor is up to date"}
          </button>
          {pending > 0 && busy === null ? (
            <p className="mt-1 text-center text-[11px] text-muted-foreground">
              Ama cannot use newly loaded material until you tap Update.
            </p>
          ) : null}

          <div className="mt-4 grid grid-cols-2 rounded-xl border border-border bg-muted p-1">
            {(["textbook", "past"] as Kind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`rounded-lg py-2 text-xs font-semibold ${kind === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
              >
                {k === "textbook" ? "Textbooks" : level.pastLabel}
              </button>
            ))}
          </div>
        </section>

        <section className="px-5 py-5">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <FileUp className="size-3.5" /> Upload {kind === "textbook" ? "a textbook" : "past questions"} (PDF)
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="v-subject">Subject</Label>
              <select id="v-subject" value={subject} onChange={(e) => setSubject(e.target.value)} className={selectCls}>
                {level.subjects.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="v-grade">Class</Label>
              <select id="v-grade" value={grade} onChange={(e) => setGrade(e.target.value)} className={selectCls}>
                <option value="auto">All classes in this book</option>
                {level.classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <input
            type="file"
            accept=".pdf,application/pdf,.json,application/json"
            className="mt-3 block w-full text-xs text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-xs file:font-semibold file:text-primary-foreground"
            disabled={busy !== null}
            onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
          />
          <Button className="mt-3 w-full gap-2" onClick={() => void update()} disabled={busy !== null || !pdf}>
            {busy === "update" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Save to vault
          </Button>
          {progress ? <p className="mt-2 text-center text-xs text-muted-foreground">{progress}</p> : null}
        </section>

        <section className="border-t border-border px-5 py-5">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <BookOpen className="size-3.5" /> {kind === "textbook" ? "Textbook" : "Past question"} table · {rows.length}
          </h2>
          {rows.length === 0 ? (
            <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">Nothing here yet.</p>
          ) : (
            <div className="mt-3 max-h-96 overflow-auto rounded-xl border border-border">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-muted text-[11px] text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2">Class</th>
                    <th className="px-2 py-2">Subject</th>
                    <th className="px-2 py-2">Content</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-border align-top">
                      <td className="px-2 py-2 font-semibold">{r.grade}</td>
                      <td className="px-2 py-2">{r.subject}</td>
                      <td className="px-2 py-2">
                        <p className="line-clamp-3">{r.content}</p>
                        {r.source_text ? <p className="mt-1 text-[10px] text-muted-foreground">{r.source_text}</p> : null}
                      </td>
                      <td className="px-2 py-2">
                        <button type="button" aria-label="Remove" onClick={() => void remove(r.id)} className="text-destructive">
                          <Trash2 className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="border-t border-border px-5 py-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Add one {kind === "textbook" ? "note" : "question"} by hand
          </h2>
          <Textarea
            className="mt-3"
            rows={5}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={
              kind === "past"
                ? "2019 Q4: Simplify 3/4 + 2/5.\nA. 23/20  B. 5/9  C. 6/20  D. 1\nAnswer: A\nWorking: 15/20 + 8/20 = 23/20"
                : "Photosynthesis is the process by which green plants make their own food…"
            }
          />
          <Input
            className="mt-2"
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder="Where it comes from (book page or exam year)"
          />
          <Button className="mt-3 w-full" variant="secondary" onClick={() => void addOne()} disabled={busy !== null}>
            {busy === "add" ? <Loader2 className="size-4 animate-spin" /> : null}
            Add to vault
          </Button>
        </section>

        <section className="border-t border-border px-5 py-5">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Database className="size-3.5" /> Test what Ama will read
          </h2>
          <div className="mt-3 flex gap-2">
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void test();
              }}
              placeholder="Ask like a student would…"
            />
            <Button size="icon" onClick={() => void test()} disabled={busy !== null} aria-label="Search the vault">
              {busy === "test" ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            </Button>
          </div>
          {chunks ? (
            chunks.length === 0 ? (
              <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">Nothing matched in this class vault.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {chunks.map((c) => (
                  <li key={c.id} className="rounded-xl border border-border bg-surface p-3">
                    <p className="text-[11px] font-semibold text-primary">
                      {c.subject} · {c.grade} · {Math.round((c.similarity ?? 0) * 100)}% match
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-xs text-foreground">{c.content.slice(0, 400)}</p>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </section>
      </main>
    </AppShell>
  );
}

function Stat({ value, label }: { value: number | undefined; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3 text-center">
      <p className="text-lg font-bold">{value ?? "—"}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function NotAdminRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to: "/", replace: true });
  }, [navigate]);
  return null;
}
