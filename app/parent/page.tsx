"use client";

import { AppShell } from "../components/AppShell";
import { Markdown } from "../components/Markdown";
import { NoRun, download } from "../components/packet";
import { DownloadIcon, PrintIcon } from "../components/icons";
import { useRun } from "../run-context";

export default function FamilyPlan() {
  const { context, parent, gaps, hasRun } = useRun();

  if (!hasRun) {
    return (
      <AppShell title="Family Plan">
        <NoRun label="family plan" />
      </AppShell>
    );
  }

  // Only the gaps the family can personally unblock belong on this page —
  // an authorization backlog is not something a parent can act on, and
  // listing it would read as one more thing they are failing to do.
  const actionable = gaps.filter((g) =>
    /hearing|audiolog|consent|signature|appointment|schedul|form|interpreter|translat/i.test(
      `${g.item} ${g.why}`,
    ),
  );

  return (
    <AppShell
      title="Family Plan"
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
            onClick={() => download("family-7-day-plan.md", parent)}
            disabled={!parent}
            className="inline-flex items-center gap-1.5 rounded-md bg-success px-3.5 py-1.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <DownloadIcon size={14} />
            Download
          </button>
        </>
      }
    >
      <section className="mx-auto max-w-3xl overflow-hidden rounded-lg border border-line bg-white shadow-card">
        <div className="bg-family px-6 py-4 text-white">
          <h1 className="text-[17px] font-semibold">
            {context?.patientName ? `A plan for ${context.patientName.split(" ")[0]}` : "Your plan"}
          </h1>
          <p className="mt-1 text-[13px] text-emerald-100">
            The next seven days, one step at a time. Nothing here is urgent tonight.
          </p>
        </div>

        <div className="px-7 py-6">
          {parent ? (
            <Markdown text={parent} accent="bg-success" bullet="check" />
          ) : (
            <p className="text-[13px] text-faint">No family plan in this run.</p>
          )}

          {actionable.length > 0 && (
            <div className="mt-7 rounded-md border border-amber-200 bg-amber-50 p-4">
              <h2 className="text-[13px] font-semibold text-warning">Only you can do these</h2>
              <p className="mt-0.5 text-[12px] text-warning/80">
                Everything else on this page is already being handled for you.
              </p>
              <ul className="mt-3 flex flex-col gap-2">
                {actionable.map((gap, i) => (
                  <li key={i} className="flex gap-2.5 text-[13px] text-ink">
                    <span className="mt-[3px] h-4 w-4 shrink-0 rounded-full border-[1.5px] border-warning/40" />
                    <span>{gap.item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <p className="mx-auto mt-4 max-w-3xl text-center text-[12px] text-faint">
        Bring this page to your next appointment — printed or on your phone.
      </p>
    </AppShell>
  );
}
