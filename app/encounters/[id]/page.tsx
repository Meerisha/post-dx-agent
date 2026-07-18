import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ageAtEncounter,
  getEncounter,
  getEncounters,
  patientName,
  type EncounterRecord,
} from "@/lib/dataset";

export async function generateStaticParams() {
  const encounters = await getEncounters();
  return encounters.map((e) => ({ id: e.metadata.encounter_id }));
}

export default async function EncounterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const record = await getEncounter(id);
  if (!record) notFound();

  const { longitudinal_summary: chart } = record.patient_context;

  return (
    <div className="flex flex-1 justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="w-full max-w-4xl px-6 py-16">
        <Link
          href="/"
          className="text-sm text-zinc-500 hover:text-black dark:hover:text-zinc-50"
        >
          ← All encounters
        </Link>

        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          {record.metadata.visit_title}
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          {patientName(record)} · {ageAtEncounter(record)}y ·{" "}
          {record.patient_context.patient.gender} ·{" "}
          {record.metadata.date.slice(0, 10)}
        </p>
        <p className="mt-1 text-sm text-zinc-500">
          {record.metadata.visit_type}
        </p>

        <Section title="Chart background">
          <div className="grid gap-6 sm:grid-cols-2">
            <LabeledList
              label="Active conditions"
              items={chart.condition_labels}
            />
            <LabeledList
              label="Active medications"
              items={chart.medication_labels}
            />
          </div>
        </Section>

        <Section title="After-visit summary">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-zinc-800 dark:text-zinc-200">
            {record.after_visit_summary}
          </pre>
          <p className="mt-4 text-xs text-zinc-500">
            {record.after_visit_summary_provenance.method} ·{" "}
            {record.after_visit_summary_provenance.review_status}
          </p>
        </Section>

        <Section title="Clinical note">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-zinc-800 dark:text-zinc-200">
            {record.note}
          </pre>
        </Section>

        <Section title="FHIR resources at this visit">
          <FhirCounts record={record} />
        </Section>

        <Section title="Transcript">
          <Transcript text={record.transcript} />
        </Section>
      </main>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
      <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function LabeledList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-sm font-medium text-black dark:text-zinc-50">
        {label}
      </h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">None recorded</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FhirCounts({ record }: { record: EncounterRecord }) {
  const counts = Object.entries(record.metadata.related_resource_counts).sort(
    (a, b) => b[1] - a[1],
  );
  return (
    <div className="flex flex-wrap gap-2">
      {counts.map(([type, count]) => (
        <span
          key={type}
          className="rounded-full border border-black/[.08] px-3 py-1 text-sm text-zinc-700 dark:border-white/[.145] dark:text-zinc-300"
        >
          {type} <span className="font-mono text-zinc-500">{count}</span>
        </span>
      ))}
    </div>
  );
}

/** Renders speaker-labeled lines (`DR:`, `PT:`, `NURSE:`, `FAMILY:`). */
function Transcript({ text }: { text: string }) {
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  return (
    <div className="flex flex-col gap-3">
      {lines.map((line, i) => {
        const match = line.match(/^([A-Z]+):\s*([\s\S]*)$/);
        if (!match) {
          return (
            <p key={i} className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">
              {line}
            </p>
          );
        }
        const [, speaker, utterance] = match;
        return (
          <p key={i} className="text-sm leading-6">
            <span className="mr-2 font-mono text-xs font-medium text-zinc-500">
              {speaker}
            </span>
            <span className="text-zinc-800 dark:text-zinc-200">{utterance}</span>
          </p>
        );
      })}
    </div>
  );
}
