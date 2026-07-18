/** The six agents in the post-diagnosis pipeline, in execution order. */
export const AGENTS = [
  { id: "fhir-parser", label: "FHIR Parser", blurb: "Extracting clinical facts from the bundle" },
  { id: "pathway", label: "Pathway Determination", blurb: "Mapping age + state to the IDEA pathway" },
  { id: "prior-auth", label: "Prior Authorization", blurb: "Drafting the payer authorization request" },
  { id: "referrals", label: "Parallel Referral", blurb: "Generating 4 referral letters at once" },
  { id: "gaps", label: "Gap Detection", blurb: "Finding documentation that could delay care" },
  { id: "dual-output", label: "Dual Output", blurb: "Streaming clinician + parent packages" },
] as const;

export type AgentId = (typeof AGENTS)[number]["id"];

export type Pane = "clinician" | "parent";

export interface Assessment {
  name: string;
  value: string;
  date?: string;
  interpretation?: string;
}

export interface PatientContext {
  patientName: string;
  birthDate: string;
  ageYears: number;
  ageMonths: number;
  /** Total age in months — the field the Part C / Part B cutoff actually turns on. */
  ageInMonths: number;
  diagnosisCode: string;
  diagnosisSystem: string;
  diagnosisDisplay: string;
  insurancePlan: string;
  insuranceType: string;
  memberId: string;
  state: string;
  assessments: Assessment[];
  diagnosingPhysician: string;
  physicianSpecialty: string;
  encounterDate: string;
  preferredLanguage?: string;
}

export interface PathwayService {
  name: string;
  priorAuthRequired: boolean;
  rationale: string;
}

export interface PathwayPlan {
  pathway: string;
  rationale: string;
  leadAgency: string;
  referralDeadline: string;
  services: PathwayService[];
}

export interface Gap {
  item: string;
  why: string;
  timeImpact: string;
  severity: "high" | "medium" | "low";
}

export interface Letter {
  id: string;
  title: string;
  recipient: string;
  filename: string;
  content: string;
}

/** NDJSON events streamed from /api/agent to the browser. */
export type StreamEvent =
  | { type: "agent_start"; agent: AgentId }
  | { type: "agent_done"; agent: AgentId; detail?: string }
  | { type: "agent_error"; agent: AgentId; message: string }
  | { type: "parsed"; data: PatientContext }
  | { type: "pathway"; data: PathwayPlan }
  | { type: "gaps"; data: Gap[] }
  | { type: "letter"; letter: Letter }
  | { type: "delta"; pane: Pane; text: string }
  | { type: "fatal"; message: string }
  | { type: "done" };

export type Emit = (event: StreamEvent) => void;
