import { readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";

const DATASET_PATH = path.join(
  process.cwd(),
  "data",
  "synthetic-ambient-fhir-25.jsonl",
);

/** A FHIR resource recorded at the visit. Shape varies by resourceType. */
export type FhirResource = {
  resourceType: string;
  id: string;
  [key: string]: unknown;
};

export type EncounterMetadata = {
  source: string;
  synthetic: boolean;
  patient_id: string;
  encounter_id: string;
  encounter_reference: string;
  date: string;
  status: string;
  visit_type: string;
  document_status: string;
  visit_title: string;
  related_resource_counts: Record<string, number>;
};

export type PatientContext = {
  patient: {
    resourceType: "Patient";
    id: string;
    name: { given?: string[]; family?: string; prefix?: string[] }[];
    gender: string;
    birthDate: string;
    [key: string]: unknown;
  };
  longitudinal_summary: {
    resource_counts: Record<string, number>;
    condition_labels: string[];
    medication_labels: string[];
  };
};

export type EncounterRecord = {
  id: string;
  metadata: EncounterMetadata;
  patient_context: PatientContext;
  encounter_fhir: {
    encounter: FhirResource;
    /** FHIR resources from this visit, grouped by resourceType. */
    related_resources: Record<string, FhirResource[]>;
  };
  transcript: string;
  note: string;
  after_visit_summary: string;
  after_visit_summary_provenance: {
    method: string;
    source: string;
    review_status: string;
  };
};

/**
 * Loads all 25 encounters. Cached per-request by React; the file is small
 * enough (~2 MB) that parsing it whole beats indexing it.
 */
export const getEncounters = cache(async (): Promise<EncounterRecord[]> => {
  const raw = await readFile(DATASET_PATH, "utf8");
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as EncounterRecord);
});

/** Looks up one encounter by its `encounter_id` (the URL slug). */
export async function getEncounter(
  encounterId: string,
): Promise<EncounterRecord | undefined> {
  const encounters = await getEncounters();
  return encounters.find((e) => e.metadata.encounter_id === encounterId);
}

export function patientName(record: EncounterRecord): string {
  const name = record.patient_context.patient.name?.[0];
  if (!name) return "Unknown patient";
  return [name.given?.join(" "), name.family].filter(Boolean).join(" ");
}

/** Age in whole years at the time of the encounter. */
export function ageAtEncounter(record: EncounterRecord): number {
  const birth = new Date(record.patient_context.patient.birthDate);
  const visit = new Date(record.metadata.date);
  let age = visit.getFullYear() - birth.getFullYear();
  const monthDelta = visit.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && visit.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}

export function totalFhirResources(record: EncounterRecord): number {
  return Object.values(record.metadata.related_resource_counts).reduce(
    (sum, n) => sum + n,
    0,
  );
}
