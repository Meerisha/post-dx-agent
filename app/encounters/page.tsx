import Link from "next/link";
import {
  ageAtEncounter,
  getEncounters,
  patientName,
  totalFhirResources,
} from "@/lib/dataset";

export default async function EncountersIndex() {
  const encounters = await getEncounters();
  const sorted = [...encounters].sort((a, b) =>
    a.metadata.date < b.metadata.date ? 1 : -1,
  );

  return (
    <div className="flex flex-1 justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="w-full max-w-4xl px-6 py-16">
        <Link
          href="/"
          className="text-sm text-zinc-500 hover:text-black dark:hover:text-zinc-50"
        >
          ← Agent
        </Link>

        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Encounters
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          {encounters.length} synthetic ambient encounters — transcript, clinical
          note, after-visit summary, and FHIR context.
        </p>

        <ul className="mt-10 flex flex-col gap-3">
          {sorted.map((record) => (
            <li key={record.id}>
              <Link
                href={`/encounters/${record.metadata.encounter_id}`}
                className="block rounded-lg border border-black/[.08] bg-white p-5 transition-colors hover:border-black/20 dark:border-white/[.145] dark:bg-zinc-950 dark:hover:border-white/30"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-black dark:text-zinc-50">
                    {record.metadata.visit_title}
                  </span>
                  <span className="font-mono text-sm text-zinc-500">
                    {record.metadata.date.slice(0, 10)}
                  </span>
                </div>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {patientName(record)} · {ageAtEncounter(record)}y ·{" "}
                  {record.patient_context.patient.gender} ·{" "}
                  {totalFhirResources(record)} FHIR resources
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
