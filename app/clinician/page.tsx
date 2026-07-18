"use client";

import { useMemo, useState } from "react";
import { AppShell } from "../components/AppShell";
import { Markdown } from "../components/Markdown";
import { CodeText, NoRun, PatientBar, SEVERITY, download, today } from "../components/packet";
import { DownloadIcon, PrintIcon } from "../components/icons";
import { useRun } from "../run-context";

const LETTER_TABS: { id: string; label: string }[] = [
  { id: "prior-auth", label: "Prior Auth" },
  { id: "early-intervention", label: "EI Referral" },
  { id: "developmental-pediatrician", label: "Dev Ped" },
  { id: "aba-therapy", label: "ABA" },
  { id: "school-district", label: "School" },
];

export default function ClinicianPackage() {
  const { context, plan, gaps, letters, clinician, hasRun } = useRun();
  const [tab, setTab] = useState("memo");

  const tabs = useMemo(
    () => [
      { id: "memo", label: "Cover Memo" },
      ...LETTER_TABS.filter((t) => letters.some((l) => l.id === t.id)),
      ...(gaps.length ? [{ id: "gaps", label: "Gaps" }] : []),
    ],
    [letters, gaps],
  );

  const activeLetter = letters.find((l) => l.id === tab);

  const downloadAll = () =>
    download(
      "clinician-package.txt",
      letters
        .map((l) => `${"=".repeat(72)}\n${l.title} → ${l.recipient}\n${"=".repeat(72)}\n\n${l.content}`)
        .join("\n\n\n"),
    );

  if (!hasRun) {
    return (
      <AppShell title="Clinician Package">
        <NoRun label="clinician package" />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Clinician Package"
      actions={
        <>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-slate-50"
          >
            <PrintIcon size={14} />
            Print
          </button>
          <button
            onClick={downloadAll}
            disabled={letters.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <DownloadIcon size={14} />
            Download all ({letters.length})
          </button>
        </>
      }
    >
      <section className="overflow-hidden rounded-lg border border-line bg-white shadow-card">
        <div className="bg-clinician px-5 py-3 text-white">
          <h1 className="text-[15px] font-semibold">Clinician Package</h1>
          <p className="mt-0.5 text-[12px] text-blue-100">
            Unsigned drafts — review and sign before submission
          </p>
        </div>

        <div className="px-5 pt-4">
          {context && (
            <PatientBar
              name={context.patientName}
              ageYears={context.ageYears}
              ageMonths={context.ageMonths}
              diagnosisCode={context.diagnosisCode}
              pathway={plan?.pathway}
            />
          )}
        </div>

        <div className="no-print mt-3 flex overflow-x-auto border-b border-line bg-slate-50">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`shrink-0 border-b-2 px-4 py-2.5 text-[12px] font-medium transition-colors ${
                tab === t.id
                  ? "border-primary bg-white text-primary"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="bg-white p-6">
          {tab === "memo" &&
            (clinician ? (
              <Markdown text={clinician} accent="bg-primary" />
            ) : (
              <p className="text-[13px] text-faint">No cover memo in this run.</p>
            ))}

          {tab === "gaps" && (
            <div className="flex flex-col gap-3.5">
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
                      <span className="font-mono text-[11px] text-warning">{gap.timeImpact}</span>
                    </div>
                    <p className="mt-0.5 text-[13px] text-muted">{gap.why}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeLetter && (
            <article className="mx-auto max-w-3xl">
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
                className="no-print mt-6 inline-flex items-center gap-1.5 rounded-md border border-primary px-3 py-1.5 text-[12px] font-medium text-primary transition-colors hover:bg-blue-50"
              >
                <DownloadIcon size={14} />
                Download this letter
              </button>
            </article>
          )}
        </div>
      </section>
    </AppShell>
  );
}
