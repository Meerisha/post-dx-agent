"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import sampleBundle from "@/data/sample-fhir-bundle.json";
import { Markdown } from "./components/Markdown";
import {
  AlertIcon,
  ChartIcon,
  CheckIcon,
  ColumnsIcon,
  CrossIcon,
  DocumentIcon,
  DownloadIcon,
  EnvelopeIcon,
  ForkIcon,
  HeartIcon,
  LocationIcon,
  MagnifierIcon,
  PrintIcon,
  ShieldIcon,
  StethoscopeIcon,
  UsersIcon,
  XIcon,
} from "./components/icons";
import { AGENTS, type AgentId } from "@/lib/agents/types";
import type { Gap, Letter, PathwayPlan, PatientContext, StreamEvent } from "@/lib/agents/types";

type AgentState = "idle" | "running" | "done" | "error";

/** Per-agent identity: glyph + resting colour. State overrides the chip itself. */
const AGENT_VISUALS: Record<AgentId, { Icon: typeof DocumentIcon; tint: string }> = {
  "fhir-parser": { Icon: DocumentIcon, tint: "text-primary" },
  pathway: { Icon: ForkIcon, tint: "text-violet" },
  "prior-auth": { Icon: ShieldIcon, tint: "text-warning" },
  referrals: { Icon: EnvelopeIcon, tint: "text-teal" },
  gaps: { Icon: MagnifierIcon, tint: "text-danger" },
  "dual-output": { Icon: ColumnsIcon, tint: "text-success" },
};

/** Short labels — the pipeline strip has ~150px per card. */
const AGENT_SHORT: Record<AgentId, string> = {
  "fhir-parser": "Parser",
  pathway: "Pathway",
  "prior-auth": "Prior Auth",
  referrals: "Referrals",
  gaps: "Gap Analysis",
  "dual-output": "Output",
};

/** Tab labels for the letters the pipeline emits, in packet order. */
const LETTER_TABS: { id: string; label: string }[] = [
  { id: "prior-auth", label: "Prior Auth" },
  { id: "early-intervention", label: "EI Referral" },
  { id: "developmental-pediatrician", label: "Dev Ped" },
  { id: "aba-therapy", label: "ABA" },
  { id: "school-district", label: "School" },
];

const SEVERITY: Record<Gap["severity"], { chip: string; dot: string }> = {
  high: { chip: "bg-red-50 text-danger border-red-200", dot: "bg-danger" },
  medium: { chip: "bg-amber-50 text-warning border-amber-200", dot: "bg-warning" },
  low: { chip: "bg-slate-100 text-muted border-line", dot: "bg-faint" },
};

function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Renders clinical codes inline as monospace pills. ICD-10-CM is letter + two
 * digits + optional decimal (F84.0); CPT is a bare five-digit code (97153).
 * Anything unmatched passes through untouched.
 */
const CODE_PATTERN = /\b([A-TV-Z]\d{2}(?:\.\d{1,4})?|\d{5})\b/g;

function CodeText({ text }: { text: string }) {
  const parts = text.split(CODE_PATTERN);
  return (
    <>
      {parts.map((part, i) =>
        // split() with one capture group puts matches at every odd index.
        i % 2 === 1 ? (
          <code
            key={i}
            className="mx-px rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[11px] font-medium text-primary"
          >
            {part}
          </code>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function today() {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

type NavId = "new-patient" | "prior-auth" | "referrals" | "gaps" | "reports";

const NAV: { id: NavId; label: string; Icon: typeof DocumentIcon }[] = [
  { id: "new-patient", label: "New Patient", Icon: DocumentIcon },
  { id: "prior-auth", label: "Prior Authorization", Icon: ShieldIcon },
  { id: "referrals", label: "Referrals", Icon: EnvelopeIcon },
  { id: "gaps", label: "Gap Analysis", Icon: MagnifierIcon },
  { id: "reports", label: "Reports", Icon: ChartIcon },
];

function Sidebar({ active, onSelect }: { active: NavId; onSelect: (id: NavId) => void }) {
  return (
    <aside className="no-print fixed inset-y-0 left-0 flex w-60 flex-col bg-sidebar">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-white">
          <CrossIcon size={18} />
        </span>
        <span className="min-w-0">
          <span className="block text-[18px] font-bold leading-tight text-white">PostDx</span>
          <span className="block text-[11px] leading-tight text-slate-400">
            Autonomous Care Coordination
          </span>
        </span>
      </div>

      <nav className="mt-2 flex flex-col">
        {NAV.map(({ id, label, Icon }) => {
          const isActive = id === active;
          return (
            <button
              key={id}
              onClick={() => onSelect(id)}
              className={`flex items-center gap-3 border-l-[3px] px-5 py-2.5 text-left text-sm transition-colors ${
                isActive
                  ? "border-primary bg-sidebar-active text-white"
                  : "border-transparent text-slate-300 hover:bg-sidebar-hover hover:text-white"
              }`}
            >
              <Icon size={18} className="shrink-0 opacity-80" />
              {label}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto px-5 py-4">
        <Link
          href="/encounters"
          className="mb-3 block text-[11px] text-slate-400 transition-colors hover:text-slate-200"
        >
          Encounter browser →
        </Link>
        <p className="text-[11px] text-slate-500">Powered by Claude</p>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Agent pipeline strip
// ---------------------------------------------------------------------------

function AgentCard({
  id,
  state,
  detail,
  elapsed,
}: {
  id: AgentId;
  state: AgentState;
  detail?: string;
  elapsed?: number;
}) {
  const { Icon, tint } = AGENT_VISUALS[id];

  const border =
    state === "running"
      ? "border-blue-200"
      : state === "done"
        ? "border-emerald-100"
        : state === "error"
          ? "border-red-200"
          : "border-line";

  const status =
    state === "running"
      ? "Processing…"
      : state === "done"
        ? elapsed
          ? `${(elapsed / 1000).toFixed(1)}s`
          : "Complete"
        : state === "error"
          ? "Failed"
          : "Idle";

  return (
    <div
      className={`relative z-10 flex flex-1 flex-col items-center gap-2 rounded-md border bg-white p-3 text-center transition-colors ${border}`}
      title={detail}
    >
      <span className="relative flex h-8 w-8 items-center justify-center">
        {state === "running" && (
          <span className="halo absolute inset-0 rounded-full bg-primary" aria-hidden />
        )}
        <span
          className={`relative flex h-8 w-8 items-center justify-center rounded-full ${
            state === "running"
              ? "bg-primary text-white"
              : state === "done"
                ? "bg-success text-white"
                : state === "error"
                  ? "bg-danger text-white"
                  : `bg-slate-100 ${tint}`
          }`}
        >
          {state === "done" ? (
            <CheckIcon size={16} />
          ) : state === "error" ? (
            <XIcon size={16} />
          ) : (
            <Icon size={16} />
          )}
        </span>
      </span>

      <span className="text-[10px] font-medium uppercase tracking-wide text-ink">
        {AGENT_SHORT[id]}
      </span>
      <span className="text-[11px] text-muted">{status}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <DocumentIcon size={48} className="text-slate-300" />
      <p className="mt-4 text-sm font-medium text-muted">Upload patient FHIR data to begin</p>
      <p className="mt-1.5 max-w-xs text-[13px] leading-relaxed text-faint">
        The agent pipeline will generate a complete care coordination package in under 90 seconds
      </p>
    </div>
  );
}

/** Thin determinate bar. Holds at 95% until the stream closes so it never
 *  reads as finished while text is still arriving. */
function ProgressBar({
  chars,
  target,
  done,
  color,
}: {
  chars: number;
  target: number;
  done: boolean;
  color: string;
}) {
  const pct = done ? 100 : Math.min(95, (chars / target) * 100);
  return (
    <div className="h-1 w-full bg-slate-100">
      <div
        className={`h-full transition-[width] duration-300 ease-out ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Home() {
  const [raw, setRaw] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [nav, setNav] = useState<NavId>("new-patient");
  const [tab, setTab] = useState<string>("memo");

  const [states, setStates] = useState<Record<AgentId, AgentState>>(
    () => Object.fromEntries(AGENTS.map((a) => [a.id, "idle"])) as Record<AgentId, AgentState>,
  );
  const [details, setDetails] = useState<Partial<Record<AgentId, string>>>({});
  const [elapsed, setElapsed] = useState<Partial<Record<AgentId, number>>>({});
  const [context, setContext] = useState<PatientContext | null>(null);
  const [plan, setPlan] = useState<PathwayPlan | null>(null);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [letters, setLetters] = useState<Letter[]>([]);
  const [clinician, setClinician] = useState("");
  const [parent, setParent] = useState("");

  const startedAt = useRef<Partial<Record<AgentId, number>>>({});
  const clinicianRef = useRef<HTMLDivElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const hasOutput = clinician || parent || letters.length > 0 || running;
  const dualDone = states["dual-output"] === "done";

  const reset = () => {
    setStates(
      Object.fromEntries(AGENTS.map((a) => [a.id, "idle"])) as Record<AgentId, AgentState>,
    );
    setDetails({});
    setElapsed({});
    startedAt.current = {};
    setContext(null);
    setPlan(null);
    setGaps([]);
    setLetters([]);
    setClinician("");
    setParent("");
    setError(null);
    setTab("memo");
  };

  const handleEvent = useCallback((event: StreamEvent) => {
    switch (event.type) {
      case "agent_start":
        startedAt.current[event.agent] = performance.now();
        setStates((s) => ({ ...s, [event.agent]: "running" }));
        break;
      case "agent_done": {
        const began = startedAt.current[event.agent];
        if (began) setElapsed((e) => ({ ...e, [event.agent]: performance.now() - began }));
        setStates((s) => ({ ...s, [event.agent]: "done" }));
        if (event.detail) setDetails((d) => ({ ...d, [event.agent]: event.detail }));
        break;
      }
      case "agent_error":
        setStates((s) => ({ ...s, [event.agent]: "error" }));
        setDetails((d) => ({ ...d, [event.agent]: event.message }));
        break;
      case "parsed":
        setContext(event.data);
        break;
      case "pathway":
        setPlan(event.data);
        break;
      case "gaps":
        setGaps(event.data);
        break;
      case "letter":
        setLetters((l) => (l.some((x) => x.id === event.letter.id) ? l : [...l, event.letter]));
        break;
      case "delta":
        if (event.pane === "clinician") setClinician((t) => t + event.text);
        else setParent((t) => t + event.text);
        break;
      case "fatal":
        setError(event.message);
        break;
    }
  }, []);

  async function run(bundleText: string) {
    let bundle: unknown;
    try {
      bundle = JSON.parse(bundleText);
    } catch {
      setError("That isn't valid JSON. Paste a FHIR Bundle or drop a .json file.");
      return;
    }

    reset();
    setRunning(true);

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundle }),
      });

      if (!response.ok || !response.body) {
        const message = await response.text().catch(() => "");
        throw new Error(message || `Request failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            handleEvent(JSON.parse(line) as StreamEvent);
          } catch {
            // Ignore a malformed line rather than killing the whole run.
          }
        }
        clinicianRef.current?.scrollTo({ top: clinicianRef.current.scrollHeight });
        parentRef.current?.scrollTo({ top: parentRef.current.scrollHeight });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setRunning(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    file.text().then((text) => {
      setRaw(text);
      run(text);
    });
  }

  const loadSample = () => {
    const text = JSON.stringify(sampleBundle, null, 2);
    setRaw(text);
    run(text);
  };

  /** Sidebar doubles as a jump target into the packet once one exists. */
  const selectNav = (id: NavId) => {
    setNav(id);
    if (id === "prior-auth") setTab("prior-auth");
    else if (id === "referrals") setTab("early-intervention");
    else if (id === "gaps") setTab("gaps");
    else if (id === "new-patient") setTab("memo");
  };

  const visibleTabs = useMemo(() => {
    const available = LETTER_TABS.filter((t) => letters.some((l) => l.id === t.id));
    return [
      { id: "memo", label: "Cover Memo" },
      ...available,
      ...(gaps.length ? [{ id: "gaps", label: "Gaps" }] : []),
    ];
  }, [letters, gaps]);

  const activeLetter = letters.find((l) => l.id === tab);

  return (
    <div className="min-h-screen">
      <Sidebar active={nav} onSelect={selectNav} />

      <div className="pl-60">
        {/* ── Top bar ─────────────────────────────────────────── */}
        <header className="no-print sticky top-0 z-20 flex h-12 items-center justify-between border-b border-line bg-white px-6">
          <span className="text-[13px] text-muted">New Patient Encounter</span>
          <div className="flex items-center gap-2">
            <button
              onClick={loadSample}
              disabled={running}
              className="rounded-md border border-line px-3 py-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-slate-50 disabled:opacity-40"
            >
              Load Sample
            </button>
            <button
              onClick={() => run(raw)}
              disabled={running || !raw.trim()}
              className="rounded-md bg-primary px-3.5 py-1.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {running ? "Running…" : "Run Agent →"}
            </button>
          </div>
        </header>

        <main className="px-6 py-5">
          {/* ── Input card ────────────────────────────────────── */}
          <section className="rounded-lg border border-line bg-white p-5 shadow-card">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">
              Patient FHIR Data
            </p>
            <h2 className="mt-1 text-sm font-medium text-ink">Upload or paste FHIR R4 Bundle</h2>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={`flex h-40 flex-col items-center justify-center rounded-md border-2 border-dashed transition-colors ${
                  dragging ? "border-primary bg-blue-50" : "border-slate-300 hover:bg-slate-50"
                }`}
              >
                <DocumentIcon size={28} className="text-faint" />
                <p className="mt-2.5 text-[13px] font-medium text-muted">Drop FHIR Bundle here</p>
                <p className="mt-0.5 text-[11px] text-faint">.json · R4 format</p>
              </div>

              <textarea
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                spellCheck={false}
                placeholder='{"resourceType": "Bundle"}'
                className="h-40 w-full resize-none rounded-md border border-line p-3 font-mono text-xs text-ink outline-none transition-colors placeholder:text-faint focus:border-primary"
              />
            </div>
          </section>

          {error && (
            <div className="mt-4 flex items-start gap-2.5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-danger">
              <AlertIcon size={18} className="mt-px shrink-0" />
              {error}
            </div>
          )}

          {/* ── Agent pipeline ────────────────────────────────── */}
          <section className="mt-4 rounded-lg border border-line bg-white p-5 shadow-card">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">
              Agent Pipeline
            </p>

            <div className="relative mt-4">
              {/* Rail sits behind the cards, inset so it never pokes past the ends. */}
              <div
                className={`absolute left-[8%] right-[8%] top-9 h-px ${running ? "rail-active" : "rail"}`}
                aria-hidden
              />
              <div className="relative flex gap-2">
                {AGENTS.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    id={agent.id}
                    state={states[agent.id]}
                    detail={details[agent.id] ?? agent.blurb}
                    elapsed={elapsed[agent.id]}
                  />
                ))}
              </div>
            </div>

            {/* Extracted facts — only once the parser has returned. */}
            {context && (
              <div className="mt-5 border-t border-line pt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold text-ink">{context.patientName}</span>
                  <span className="text-[13px] text-muted">
                    {context.ageYears}y {context.ageMonths}m
                  </span>
                  {context.diagnosisCode && (
                    <code className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[11px] font-medium text-primary">
                      {context.diagnosisCode}
                    </code>
                  )}
                  {context.diagnosisDisplay && (
                    <span className="text-[13px] text-muted">{context.diagnosisDisplay}</span>
                  )}
                  {context.state && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-primary">
                      <LocationIcon size={12} />
                      {context.state}
                    </span>
                  )}
                  {context.insurancePlan && (
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] text-muted">
                      {context.insurancePlan}
                    </span>
                  )}
                  {plan && (
                    <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] font-medium text-violet">
                      {plan.pathway}
                    </span>
                  )}
                </div>

                {context.assessments.length > 0 && (
                  <table className="mt-3.5 w-full max-w-2xl border-collapse text-left">
                    <thead>
                      <tr className="border-b border-line">
                        {["Assessment", "Score", "Interpretation"].map((h) => (
                          <th
                            key={h}
                            className="py-1.5 pr-4 text-[10px] font-semibold uppercase tracking-wider text-faint"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {context.assessments.map((a, i) => (
                        <tr key={i} className="border-b border-line last:border-0">
                          <td className="py-1.5 pr-4 text-[13px] text-ink">{a.name}</td>
                          <td className="py-1.5 pr-4 font-mono text-[13px] font-medium text-ink">
                            {a.value}
                          </td>
                          <td className="py-1.5 pr-4 text-[13px] text-muted">
                            {a.interpretation ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </section>

          {/* ── Output ────────────────────────────────────────── */}
          {!hasOutput ? (
            <section className="mt-4 rounded-lg border border-line bg-white shadow-card">
              <EmptyState />
            </section>
          ) : (
            <section className="mt-4 grid gap-4 xl:grid-cols-2">
              {/* Clinician package */}
              <div className="flex flex-col overflow-hidden rounded-lg border border-line bg-white shadow-card">
                <div className="flex items-center justify-between bg-clinician px-4 py-2.5 text-white">
                  <h2 className="text-[13px] font-semibold uppercase tracking-wider">
                    Clinician Package
                  </h2>
                  <StethoscopeIcon size={18} className="opacity-80" />
                </div>

                <ProgressBar
                  chars={clinician.length}
                  target={1200}
                  done={dualDone}
                  color="bg-primary"
                />

                <div className="no-print flex overflow-x-auto border-b border-line bg-slate-50">
                  {visibleTabs.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      className={`shrink-0 border-b-2 px-3.5 py-2 text-[12px] font-medium transition-colors ${
                        tab === t.id
                          ? "border-primary bg-white text-primary"
                          : "border-transparent text-muted hover:text-ink"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <div ref={clinicianRef} className="max-h-[520px] overflow-y-auto bg-white p-5">
                  {tab === "memo" && (
                    <>
                      {clinician ? (
                        <>
                          <Markdown text={clinician} accent="bg-primary" />
                          {running && (
                            <span className="caret ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-primary" />
                          )}
                        </>
                      ) : (
                        <p className="text-[13px] text-faint">Generating clinical package…</p>
                      )}
                    </>
                  )}

                  {tab === "gaps" && (
                    <div className="flex flex-col gap-3">
                      {gaps.map((gap, i) => (
                        <div key={i} className="flex gap-3">
                          <span
                            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY[gap.severity].dot}`}
                          />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[13px] font-medium text-ink">{gap.item}</span>
                              <span
                                className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${SEVERITY[gap.severity].chip}`}
                              >
                                {gap.severity}
                              </span>
                              <span className="font-mono text-[11px] text-warning">
                                {gap.timeImpact}
                              </span>
                            </div>
                            <p className="mt-0.5 text-[13px] text-muted">{gap.why}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeLetter && (
                    <article>
                      <table className="w-full border-collapse text-left">
                        <tbody>
                          {[
                            ["TO", activeLetter.recipient],
                            ["FROM", context?.diagnosingPhysician ?? "—"],
                            ["RE", activeLetter.title],
                            ["DATE", today()],
                          ].map(([label, value]) => (
                            <tr key={label}>
                              <th className="w-16 py-0.5 align-top text-[10px] font-semibold uppercase tracking-wider text-faint">
                                {label}
                              </th>
                              <td className="py-0.5 text-[13px] text-ink">{value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <hr className="my-4 border-line" />

                      <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">
                        <CodeText text={activeLetter.content} />
                      </div>

                      <button
                        onClick={() => download(activeLetter.filename, activeLetter.content)}
                        className="no-print mt-5 inline-flex items-center gap-1.5 rounded-md border border-primary px-3 py-1.5 text-[12px] font-medium text-primary transition-colors hover:bg-blue-50"
                      >
                        <DownloadIcon size={14} />
                        Download letter
                      </button>
                    </article>
                  )}
                </div>
              </div>

              {/* Family action plan */}
              <div className="flex flex-col overflow-hidden rounded-lg border border-line bg-white shadow-card">
                <div className="flex items-center justify-between bg-family px-4 py-2.5 text-white">
                  <h2 className="text-[13px] font-semibold uppercase tracking-wider">
                    Family Action Plan
                  </h2>
                  <HeartIcon size={18} className="opacity-80" />
                </div>

                <ProgressBar
                  chars={parent.length}
                  target={1400}
                  done={dualDone}
                  color="bg-success"
                />

                <div ref={parentRef} className="max-h-[520px] overflow-y-auto bg-white p-5">
                  {parent ? (
                    <>
                      <Markdown text={parent} accent="bg-success" bullet="check" />
                      {running && (
                        <span className="caret ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-success" />
                      )}
                    </>
                  ) : (
                    <p className="text-[13px] text-faint">Generating family action plan…</p>
                  )}

                  {parent && !running && (
                    <button
                      onClick={() => window.print()}
                      className="no-print mt-5 inline-flex items-center gap-1.5 rounded-md border border-success px-3 py-1.5 text-[12px] font-medium text-success transition-colors hover:bg-emerald-50"
                    >
                      <PrintIcon size={14} />
                      Print plan
                    </button>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* ── Standing clinical disclaimer ──────────────────── */}
          <p className="mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] leading-relaxed text-warning">
            <AlertIcon size={16} className="mt-px shrink-0" />
            <span>
              <strong className="font-semibold">Drafts, not decisions.</strong> Every document here
              is AI-generated from synthetic data and requires review and signature by a licensed
              clinician before any clinical or payer use. Payer and agency requirements vary by plan
              and by state — verify before submitting.
            </span>
          </p>

          <footer className="mt-4 flex items-center justify-end gap-1.5 pb-2 text-[11px] text-faint">
            <UsersIcon size={13} />
            Built at Abridge × Anthropic × Lightspeed Hackathon · July 18 2026 · Solo
          </footer>
        </main>
      </div>
    </div>
  );
}
