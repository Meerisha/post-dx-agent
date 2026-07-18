"use client";

import { useState } from "react";
import sampleBundle from "@/data/sample-fhir-bundle.json";
import { AppShell } from "./components/AppShell";
import { AlertIcon, ColumnsIcon, DocumentIcon, EnvelopeIcon, ForkIcon, LocationIcon, MagnifierIcon, ShieldIcon } from "./components/icons";
import { AGENTS, type AgentId } from "@/lib/agents/types";
import { useRun, type AgentState } from "./run-context";

/** Per-agent identity: glyph + resting colour. State overrides the chip itself. */
const AGENT_VISUALS: Record<AgentId, { Icon: typeof DocumentIcon; tint: string }> = {
  "fhir-parser": { Icon: DocumentIcon, tint: "text-primary" },
  pathway: { Icon: ForkIcon, tint: "text-violet" },
  "prior-auth": { Icon: ShieldIcon, tint: "text-warning" },
  referrals: { Icon: EnvelopeIcon, tint: "text-teal" },
  gaps: { Icon: MagnifierIcon, tint: "text-danger" },
  "dual-output": { Icon: ColumnsIcon, tint: "text-success" },
};

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
          <Icon size={16} />
        </span>
      </span>
      <span className="text-[11px] font-medium leading-tight text-ink">
        {AGENTS.find((a) => a.id === id)?.label}
      </span>
      <span className="font-mono text-[10px] text-faint">{status}</span>
    </div>
  );
}

export default function Home() {
  const [raw, setRaw] = useState("");
  const [dragging, setDragging] = useState(false);
  const { states, details, elapsed, running, error, context, plan, clinician, parent, run } =
    useRun();

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
    <AppShell
      title="New Patient Encounter"
      actions={
        <>
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
        </>
      }
    >
      {/* ── Input ─────────────────────────────────────────────── */}
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

      {/* ── Pipeline ──────────────────────────────────────────── */}
      <section className="mt-4 rounded-lg border border-line bg-white p-5 shadow-card">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">
          Agent Pipeline
        </p>

        <div className="relative mt-4">
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

        {/* Wave 3 is otherwise dead air on this page — show both streams filling. */}
        {running && (clinician || parent) && (
          <div className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
            {[
              { label: "Clinician package", chars: clinician.length, target: 1300, bar: "bg-primary" },
              { label: "Family plan", chars: parent.length, target: 1400, bar: "bg-success" },
            ].map((s) => (
              <div key={s.label}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[12px] font-medium text-ink">{s.label}</span>
                  <span className="font-mono text-[10px] text-faint">{s.chars} chars</span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${s.bar}`}
                    style={{ width: `${Math.min(100, (s.chars / s.target) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
