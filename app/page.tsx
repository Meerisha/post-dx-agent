"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import sampleBundle from "@/data/sample-fhir-bundle.json";
import { Markdown } from "./components/Markdown";
import { AGENTS, type AgentId } from "@/lib/agents/types";
import type { Gap, Letter, PathwayPlan, PatientContext, StreamEvent } from "@/lib/agents/types";

type AgentState = "idle" | "running" | "done" | "error";

const SEVERITY_STYLES: Record<Gap["severity"], string> = {
  high: "bg-rose-500/10 text-rose-600 ring-rose-500/20 dark:text-rose-400",
  medium: "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-400",
  low: "bg-zinc-500/10 text-zinc-600 ring-zinc-500/20 dark:text-zinc-400",
};

function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [raw, setRaw] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const [states, setStates] = useState<Record<AgentId, AgentState>>(
    () => Object.fromEntries(AGENTS.map((a) => [a.id, "idle"])) as Record<AgentId, AgentState>,
  );
  const [details, setDetails] = useState<Partial<Record<AgentId, string>>>({});
  const [context, setContext] = useState<PatientContext | null>(null);
  const [plan, setPlan] = useState<PathwayPlan | null>(null);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [letters, setLetters] = useState<Letter[]>([]);
  const [clinician, setClinician] = useState("");
  const [parent, setParent] = useState("");

  const clinicianRef = useRef<HTMLDivElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const reset = () => {
    setStates(
      Object.fromEntries(AGENTS.map((a) => [a.id, "idle"])) as Record<AgentId, AgentState>,
    );
    setDetails({});
    setContext(null);
    setPlan(null);
    setGaps([]);
    setLetters([]);
    setClinician("");
    setParent("");
    setError(null);
  };

  const handleEvent = useCallback((event: StreamEvent) => {
    switch (event.type) {
      case "agent_start":
        setStates((s) => ({ ...s, [event.agent]: "running" }));
        break;
      case "agent_done":
        setStates((s) => ({ ...s, [event.agent]: "done" }));
        if (event.detail) setDetails((d) => ({ ...d, [event.agent]: event.detail }));
        break;
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

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans text-zinc-900 dark:bg-[#09090b] dark:text-zinc-100">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="border-b border-black/[.07] bg-white/80 backdrop-blur dark:border-white/[.08] dark:bg-black/40">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              Post-Diagnosis Autonomous Agent
            </h1>
            <p className="mt-0.5 text-xs text-zinc-500">
              FHIR Bundle → pathway, prior auth, referrals, gaps, and a parent plan
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/encounters"
              className="rounded-lg px-3 py-2 text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              Encounter browser
            </Link>
            <button
              onClick={loadSample}
              disabled={running}
              className="rounded-lg border border-black/[.08] px-3 py-2 text-xs font-medium transition-colors hover:bg-black/[.04] disabled:opacity-40 dark:border-white/[.12] dark:hover:bg-white/[.06]"
            >
              Load sample patient
            </button>
            <button
              onClick={() => run(raw)}
              disabled={running || !raw.trim()}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {running ? "Running…" : "Run agents"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-6">
        {/* ── Top: input ───────────────────────────────────────── */}
        <section
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`rounded-xl border-2 border-dashed p-4 transition-colors ${
            dragging
              ? "border-zinc-900 bg-zinc-900/[.03] dark:border-zinc-100 dark:bg-white/[.04]"
              : "border-black/[.10] dark:border-white/[.12]"
          }`}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500">
              Drop a FHIR Bundle .json here, or paste below
            </span>
            {raw && (
              <button
                onClick={() => setRaw("")}
                className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                Clear
              </button>
            )}
          </div>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            spellCheck={false}
            placeholder='{ "resourceType": "Bundle", "entry": [ … ] }'
            className="h-24 w-full resize-y rounded-lg border border-black/[.08] bg-white p-3 font-mono text-xs outline-none focus:border-zinc-400 dark:border-white/[.10] dark:bg-black/40 dark:focus:border-zinc-500"
          />
        </section>

        {error && (
          <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/[.06] px-4 py-3 text-sm text-rose-700 dark:text-rose-400">
            {error}
          </div>
        )}

        {/* ── Middle: agent status ─────────────────────────────── */}
        <section className="mt-6 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {AGENTS.map((agent, i) => {
            const state = states[agent.id];
            return (
              <div
                key={agent.id}
                className={`rounded-xl border p-3.5 transition-all duration-300 ${
                  state === "running"
                    ? "border-zinc-900/30 bg-white shadow-sm dark:border-zinc-100/25 dark:bg-white/[.05]"
                    : state === "done"
                      ? "border-emerald-500/25 bg-emerald-500/[.04]"
                      : state === "error"
                        ? "border-rose-500/30 bg-rose-500/[.05]"
                        : "border-black/[.07] bg-white/50 dark:border-white/[.07] dark:bg-white/[.02]"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-2 w-2 shrink-0">
                    {state === "running" && (
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500 opacity-75" />
                    )}
                    <span
                      className={`relative inline-flex h-2 w-2 rounded-full ${
                        state === "running"
                          ? "bg-blue-500"
                          : state === "done"
                            ? "bg-emerald-500"
                            : state === "error"
                              ? "bg-rose-500"
                              : "bg-zinc-300 dark:bg-zinc-700"
                      }`}
                    />
                  </span>
                  <span className="font-mono text-[10px] text-zinc-400">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-sm font-medium">{agent.label}</span>
                </div>
                <p className="mt-1.5 pl-[26px] text-xs text-zinc-500">
                  {details[agent.id] ?? agent.blurb}
                </p>
              </div>
            );
          })}
        </section>

        {/* ── Extracted context ────────────────────────────────── */}
        {context && (
          <section className="mt-5 flex flex-wrap gap-2">
            {[
              [context.patientName, "Patient"],
              [`${context.ageYears}y ${context.ageMonths}m`, "Age"],
              [context.diagnosisCode, "Dx"],
              [context.insuranceType, "Coverage"],
              [context.state, "State"],
              ...context.assessments.map((a) => [`${a.name} ${a.value}`, "Assessment"] as const),
              [context.diagnosingPhysician, "Diagnosed by"],
            ]
              .filter(([value]) => value)
              .map(([value, label], i) => (
                <div
                  key={i}
                  className="rounded-lg border border-black/[.07] bg-white px-3 py-1.5 dark:border-white/[.08] dark:bg-white/[.03]"
                >
                  <div className="text-[10px] uppercase tracking-wide text-zinc-400">{label}</div>
                  <div className="text-xs font-medium">{value}</div>
                </div>
              ))}
          </section>
        )}

        {/* ── Gaps ─────────────────────────────────────────────── */}
        {gaps.length > 0 && (
          <section className="mt-5 rounded-xl border border-black/[.07] bg-white p-4 dark:border-white/[.08] dark:bg-white/[.03]">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Detected gaps
            </h2>
            <div className="mt-3 flex flex-col gap-2.5">
              {gaps.map((gap, i) => (
                <div key={i} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ring-1 ring-inset ${SEVERITY_STYLES[gap.severity]}`}
                  >
                    {gap.severity}
                  </span>
                  <span className="text-sm font-medium">{gap.item}</span>
                  <span className="font-mono text-xs text-amber-600 dark:text-amber-500">
                    {gap.timeImpact}
                  </span>
                  <p className="w-full text-xs text-zinc-500">{gap.why}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Bottom: dual output ──────────────────────────────── */}
        <section className="mt-5 grid gap-4 lg:grid-cols-2">
          {/* Clinician */}
          <div className="flex flex-col overflow-hidden rounded-xl border border-blue-500/25 bg-blue-500/[.03]">
            <div className="flex items-center justify-between border-b border-blue-500/20 bg-blue-500/[.06] px-4 py-2.5">
              <h2 className="text-sm font-semibold text-blue-700 dark:text-blue-400">
                Clinician Package
              </h2>
              <span className="text-[10px] uppercase tracking-wide text-blue-600/60 dark:text-blue-400/60">
                {letters.length} document{letters.length === 1 ? "" : "s"}
              </span>
            </div>

            <div ref={clinicianRef} className="max-h-[560px] overflow-y-auto p-4">
              {clinician ? (
                <Markdown text={clinician} accent="bg-blue-500" />
              ) : (
                <p className="text-xs text-zinc-400">
                  {running ? "Waiting on upstream agents…" : "Run the agents to generate."}
                </p>
              )}

              {letters.length > 0 && (
                <div className="mt-5 flex flex-col gap-2 border-t border-blue-500/15 pt-4">
                  {letters.map((letter) => (
                    <div
                      key={letter.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-blue-500/20 bg-white/60 px-3 py-2.5 dark:bg-black/30"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium">{letter.title}</div>
                        <div className="truncate text-[11px] text-zinc-500">
                          → {letter.recipient}
                        </div>
                      </div>
                      <button
                        onClick={() => download(letter.filename, letter.content)}
                        className="shrink-0 rounded-md bg-blue-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
                      >
                        Download
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() =>
                      download(
                        "clinician-package.txt",
                        letters
                          .map((l) => `${"=".repeat(72)}\n${l.title} → ${l.recipient}\n${"=".repeat(72)}\n\n${l.content}`)
                          .join("\n\n\n"),
                      )
                    }
                    className="mt-1 rounded-lg border border-blue-500/30 px-3 py-2 text-[11px] font-semibold text-blue-700 transition-colors hover:bg-blue-500/10 dark:text-blue-400"
                  >
                    Download all {letters.length} as one file
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Parent */}
          <div className="flex flex-col overflow-hidden rounded-xl border border-emerald-500/25 bg-emerald-500/[.03]">
            <div className="flex items-center justify-between border-b border-emerald-500/20 bg-emerald-500/[.06] px-4 py-2.5">
              <h2 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                Parent Package
              </h2>
              <span className="text-[10px] uppercase tracking-wide text-emerald-600/60 dark:text-emerald-400/60">
                7-day plan
              </span>
            </div>

            <div ref={parentRef} className="max-h-[560px] overflow-y-auto p-4">
              {parent ? (
                <Markdown text={parent} accent="bg-emerald-500" />
              ) : (
                <p className="text-xs text-zinc-400">
                  {running ? "Waiting on upstream agents…" : "Run the agents to generate."}
                </p>
              )}

              {parent && !running && (
                <button
                  onClick={() => download("parent-7-day-plan.md", parent)}
                  className="mt-5 w-full rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
                >
                  Download parent plan
                </button>
              )}
            </div>
          </div>
        </section>

        <footer className="mt-6 rounded-lg border border-amber-500/25 bg-amber-500/[.05] px-4 py-3 text-xs text-amber-800 dark:text-amber-300/90">
          <strong className="font-semibold">Drafts, not decisions.</strong> Every document here is
          AI-generated from synthetic data and requires review and signature by a licensed
          clinician before any clinical or payer use. Payer and agency requirements vary by plan
          and by state — verify before submitting.
        </footer>
      </main>
    </div>
  );
}
