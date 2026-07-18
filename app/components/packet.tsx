"use client";

import Link from "next/link";
import type { Gap } from "@/lib/agents/types";

export const SEVERITY: Record<Gap["severity"], { chip: string; dot: string }> = {
  high: { chip: "bg-red-50 text-danger border-red-200", dot: "bg-danger" },
  medium: { chip: "bg-amber-50 text-warning border-amber-200", dot: "bg-warning" },
  low: { chip: "bg-slate-100 text-muted border-line", dot: "bg-faint" },
};

export function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function today() {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Renders clinical codes inline as monospace pills. ICD-10-CM is letter + two
 * digits + optional decimal (F84.0); CPT is a bare five-digit code (97153).
 * Anything unmatched passes through untouched.
 */
const CODE_PATTERN = /\b([A-TV-Z]\d{2}(?:\.\d{1,4})?|\d{5})\b/g;

export function CodeText({ text }: { text: string }) {
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

/** Shown on /clinician and /parent when no run exists in this tab yet. */
export function NoRun({ label }: { label: string }) {
  return (
    <section className="rounded-lg border border-line bg-white px-6 py-16 text-center shadow-card">
      <p className="text-sm font-medium text-ink">No {label} yet</p>
      <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-muted">
        Run the pipeline against a FHIR Bundle and the {label} will appear here. Nothing is stored
        on a server — output lives in this browser tab only.
      </p>
      <Link
        href="/"
        className="mt-5 inline-block rounded-md bg-primary px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
      >
        Go to New Patient →
      </Link>
    </section>
  );
}

export function PatientBar({
  name,
  ageYears,
  ageMonths,
  diagnosisCode,
  pathway,
}: {
  name: string;
  ageYears: number;
  ageMonths: number;
  diagnosisCode?: string;
  pathway?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line pb-3">
      <span className="text-[13px] font-semibold text-ink">{name}</span>
      <span className="text-[13px] text-muted">
        {ageYears}y {ageMonths}m
      </span>
      {diagnosisCode && (
        <code className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[11px] font-medium text-primary">
          {diagnosisCode}
        </code>
      )}
      {pathway && (
        <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] font-medium text-violet">
          {pathway}
        </span>
      )}
    </div>
  );
}
