import { completeJson, completeText, streamText } from "./client";
import type {
  Emit,
  Gap,
  Letter,
  PathwayPlan,
  PatientContext,
} from "./types";

const SYNTHETIC_GUARDRAIL = `You are part of a post-diagnosis care-coordination pipeline operating on SYNTHETIC patient data for a hackathon demo.

Everything you produce is a DRAFT for a licensed clinician to review, edit, and sign. Never state or imply that a document has been reviewed, approved, or submitted. Do not invent clinical findings, dates, scores, or identifiers that are not present in the data you are given — if a needed fact is missing, write [MISSING: description] inline rather than guessing.`;

/** Whole months between two ISO dates. Done in code — models drift on date math. */
function monthsBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

// ---------------------------------------------------------------------------
// Agent 1 — FHIR Parser
// ---------------------------------------------------------------------------

export async function runFhirParser(
  bundle: unknown,
  emit: Emit,
): Promise<PatientContext> {
  emit({ type: "agent_start", agent: "fhir-parser" });

  const extracted = await completeJson<PatientContext>({
    effort: "low",
    maxTokens: 2000,
    system: `${SYNTHETIC_GUARDRAIL}

You are a FHIR R4 parser. Read the Bundle and return ONLY a JSON object — no prose, no code fence commentary.`,
    prompt: `Extract these fields from the FHIR Bundle below.

Return JSON with exactly this shape:
{
  "patientName": string,
  "birthDate": "YYYY-MM-DD",
  "diagnosisCode": string,
  "diagnosisSystem": string,
  "diagnosisDisplay": string,
  "insurancePlan": string,
  "insuranceType": string,
  "memberId": string,
  "state": string,
  "assessments": [{ "name": string, "value": string, "date": string, "interpretation": string }],
  "diagnosingPhysician": string,
  "physicianSpecialty": string,
  "encounterDate": "YYYY-MM-DD",
  "preferredLanguage": string
}

Rules:
- Include EVERY Observation with a score as an assessment.
- Use "" for any field genuinely absent from the Bundle. Do not guess.
- Do not compute age; age is calculated separately.

FHIR Bundle:
${JSON.stringify(bundle, null, 2)}`,
  });

  // Age drives the Part C / Part B gate, so compute it deterministically
  // rather than trusting model date arithmetic.
  const encounterDate = extracted.encounterDate || new Date().toISOString().slice(0, 10);
  const ageInMonths = extracted.birthDate
    ? monthsBetween(extracted.birthDate, encounterDate)
    : 0;

  const context: PatientContext = {
    ...extracted,
    encounterDate,
    ageInMonths,
    ageYears: Math.floor(ageInMonths / 12),
    ageMonths: ageInMonths % 12,
    assessments: extracted.assessments ?? [],
  };

  emit({ type: "parsed", data: context });
  emit({
    type: "agent_done",
    agent: "fhir-parser",
    detail: `${context.patientName} · ${context.ageYears}y${context.ageMonths}m · ${context.diagnosisCode}`,
  });
  return context;
}

// ---------------------------------------------------------------------------
// Agent 2 — Pathway Determination
// ---------------------------------------------------------------------------

export async function runPathway(
  ctx: PatientContext,
  emit: Emit,
): Promise<PathwayPlan> {
  emit({ type: "agent_start", agent: "pathway" });

  // The statutory cutoff is a hard rule, not a judgment call — decide it in
  // code and let the model fill in state-specific detail around it.
  const isPartC = ctx.ageInMonths < 36;
  const pathway = isPartC
    ? "IDEA Part C — Early Intervention (birth to 3)"
    : "IDEA Part B — School-based services (3 to 21)";

  const plan = await completeJson<PathwayPlan>({
    effort: "medium",
    maxTokens: 2000,
    system: `${SYNTHETIC_GUARDRAIL}

You are an early-childhood special-education navigator. Return ONLY JSON.`,
    prompt: `A child has been diagnosed and needs a service pathway.

Child: ${ctx.ageYears} years ${ctx.ageMonths} months old (${ctx.ageInMonths} months) in ${ctx.state}.
Diagnosis: ${ctx.diagnosisCode} — ${ctx.diagnosisDisplay}
Insurance: ${ctx.insurancePlan} (${ctx.insuranceType})

The pathway has ALREADY been determined by statute: "${pathway}"
(Rule: under 36 months = IDEA Part C; 36 months and over = IDEA Part B.)

Return JSON:
{
  "pathway": "${pathway}",
  "rationale": string,          // 1-2 sentences on why this pathway, citing the age
  "leadAgency": string,         // the actual lead agency in ${ctx.state} for this pathway
  "referralDeadline": string,   // the statutory//practical timeline, e.g. "within 45 days of referral"
  "services": [
    { "name": string, "priorAuthRequired": boolean, "rationale": string }
  ]
}

For "services", list 4-6 services this diagnosis typically indicates. For each,
state whether ${ctx.insurancePlan} in ${ctx.state} generally requires prior
authorization, and why. Be specific to the payer type where you can; if payer
policy genuinely varies, say so in the rationale rather than asserting.`,
  });

  const result: PathwayPlan = { ...plan, pathway, services: plan.services ?? [] };
  const authCount = result.services.filter((s) => s.priorAuthRequired).length;

  emit({ type: "pathway", data: result });
  emit({
    type: "agent_done",
    agent: "pathway",
    detail: `${isPartC ? "Part C" : "Part B"} · ${authCount} of ${result.services.length} services need prior auth`,
  });
  return result;
}

// ---------------------------------------------------------------------------
// Agent 3 — Prior Authorization
// ---------------------------------------------------------------------------

function assessmentLines(ctx: PatientContext): string {
  if (ctx.assessments.length === 0) return "(none recorded)";
  return ctx.assessments
    .map(
      (a) =>
        `- ${a.name}: ${a.value}${a.interpretation ? ` (${a.interpretation})` : ""}${a.date ? ` — ${a.date}` : ""}`,
    )
    .join("\n");
}

export async function runPriorAuth(
  ctx: PatientContext,
  plan: PathwayPlan,
  emit: Emit,
): Promise<Letter> {
  emit({ type: "agent_start", agent: "prior-auth" });

  const services = plan.services
    .filter((s) => s.priorAuthRequired)
    .map((s) => s.name)
    .join(", ");

  const content = await completeText({
    effort: "medium",
    maxTokens: 3000,
    system: `${SYNTHETIC_GUARDRAIL}

You write prior authorization requests that survive payer review. You are precise, you cite codes, and you tie every requested service to a documented clinical finding.`,
    prompt: `Write a prior authorization request letter.

PAYER: ${ctx.insurancePlan} (${ctx.insuranceType}), ${ctx.state}
MEMBER: ${ctx.patientName}, DOB ${ctx.birthDate}, age ${ctx.ageYears}y${ctx.ageMonths}m
MEMBER ID: ${ctx.memberId}
DIAGNOSIS: ${ctx.diagnosisCode} (${ctx.diagnosisSystem}) — ${ctx.diagnosisDisplay}
DIAGNOSED BY: ${ctx.diagnosingPhysician}, ${ctx.physicianSpecialty}, on ${ctx.encounterDate}
PATHWAY: ${plan.pathway}
SERVICES REQUESTED: ${services || "(see pathway services)"}

ASSESSMENT FINDINGS:
${assessmentLines(ctx)}

Structure the letter:
1. Header block (date, payer, member ID, RE: line with diagnosis code)
2. Requested services — as a list, with the clinical indication for each
3. Clinical justification — cite the diagnosis code AND the specific assessment
   scores above by name and value. This is the section that gets the auth
   approved; make the scores do the work.
4. Medical necessity statement tied to the child's age and developmental window
5. Signature block for ${ctx.diagnosingPhysician}

Plain text, no markdown. Professional payer-facing register. Use [MISSING: ...]
for any detail the record does not contain — do not invent NPI numbers, phone
numbers, or findings.`,
  });

  const letter: Letter = {
    id: "prior-auth",
    title: "Prior Authorization Request",
    recipient: ctx.insurancePlan,
    filename: `prior-auth-${ctx.diagnosisCode.replace(/\./g, "")}.txt`,
    content,
  };

  emit({ type: "letter", letter });
  emit({ type: "agent_done", agent: "prior-auth", detail: `Drafted for ${ctx.insurancePlan}` });
  return letter;
}

// ---------------------------------------------------------------------------
// Agent 4 — Parallel Referral (4 letters concurrently)
// ---------------------------------------------------------------------------

const REFERRALS = [
  {
    id: "early-intervention",
    title: "Early Intervention / Special Education Referral",
    recipientOf: (ctx: PatientContext, plan: PathwayPlan) => plan.leadAgency || `${ctx.state} lead agency`,
    brief:
      "Referral to the state lead agency to open an eligibility evaluation. State the pathway, the statutory timeline, and what the family should expect next.",
  },
  {
    id: "developmental-pediatrician",
    title: "Developmental Pediatrician Follow-Up",
    recipientOf: () => "Developmental-Behavioral Pediatrics",
    brief:
      "Follow-up referral for ongoing developmental management. Include the interval for re-assessment and what should be re-measured.",
  },
  {
    id: "aba-therapy",
    title: "ABA Therapy Referral",
    recipientOf: () => "Applied Behavior Analysis provider",
    brief:
      "Referral for an ABA assessment. Include recommended intensity range, the behavioral targets the assessment scores point to, and the authorization status.",
  },
  {
    id: "school-district",
    title: "School District Notification",
    recipientOf: (ctx: PatientContext) => `${ctx.state} local education agency`,
    brief:
      "Notification to the district requesting an IEP/IFSP eligibility determination. Reference the parent's right to request an evaluation in writing and the district's response timeline.",
  },
] as const;

export async function runParallelReferrals(
  ctx: PatientContext,
  plan: PathwayPlan,
  emit: Emit,
): Promise<Letter[]> {
  emit({ type: "agent_start", agent: "referrals" });

  const system = `${SYNTHETIC_GUARDRAIL}

You write concise, professional referral letters for pediatric care coordination.`;

  const shared = `PATIENT: ${ctx.patientName}, DOB ${ctx.birthDate}, age ${ctx.ageYears}y${ctx.ageMonths}m, ${ctx.state}
DIAGNOSIS: ${ctx.diagnosisCode} — ${ctx.diagnosisDisplay}
DIAGNOSED BY: ${ctx.diagnosingPhysician}, ${ctx.physicianSpecialty}, ${ctx.encounterDate}
INSURANCE: ${ctx.insurancePlan} (${ctx.insuranceType})
PATHWAY: ${plan.pathway}
LEAD AGENCY: ${plan.leadAgency}

ASSESSMENT FINDINGS:
${assessmentLines(ctx)}`;

  // True parallel execution — all four requests are in flight simultaneously,
  // and each letter is emitted the moment it lands rather than after the batch.
  const letters = await Promise.all(
    REFERRALS.map(async (spec) => {
      const recipient = spec.recipientOf(ctx, plan);
      const content = await completeText({
        effort: "medium",
        maxTokens: 2000,
        system,
        prompt: `Write a referral letter: ${spec.title}

TO: ${recipient}
${spec.brief}

${shared}

Plain text, no markdown. Under 400 words. Open with the referral purpose in the
first sentence. Cite the diagnosis code and the relevant assessment scores.
Close with a signature block for ${ctx.diagnosingPhysician}. Use [MISSING: ...]
for details the record does not contain.`,
      });

      const letter: Letter = {
        id: spec.id,
        title: spec.title,
        recipient,
        filename: `${spec.id}-referral.txt`,
        content,
      };
      emit({ type: "letter", letter });
      return letter;
    }),
  );

  emit({
    type: "agent_done",
    agent: "referrals",
    detail: `${letters.length} letters generated in parallel`,
  });
  return letters;
}

// ---------------------------------------------------------------------------
// Agent 5 — Gap Detection
// ---------------------------------------------------------------------------

export async function runGapDetection(
  bundle: unknown,
  ctx: PatientContext,
  plan: PathwayPlan,
  emit: Emit,
): Promise<Gap[]> {
  emit({ type: "agent_start", agent: "gaps" });

  const gaps = await completeJson<Gap[]>({
    effort: "high",
    maxTokens: 2500,
    system: `${SYNTHETIC_GUARDRAIL}

You are a utilization-review specialist who has read thousands of denied prior
authorizations. You find what is MISSING. Return ONLY a JSON array.`,
    prompt: `Review this record for documentation gaps that would delay care or trigger a prior authorization denial.

PATIENT: ${ctx.ageYears}y${ctx.ageMonths}m, ${ctx.state}, ${ctx.insurancePlan} (${ctx.insuranceType})
DIAGNOSIS: ${ctx.diagnosisCode} — ${ctx.diagnosisDisplay}
PATHWAY: ${plan.pathway}
SERVICES REQUESTED: ${plan.services.map((s) => s.name).join(", ")}

DOCUMENTATION PRESENT:
${assessmentLines(ctx)}

FULL BUNDLE:
${JSON.stringify(bundle, null, 2)}

Return a JSON array, most consequential first:
[
  {
    "item": string,       // the specific missing document or data element
    "why": string,        // what it blocks, and which payer/agency requires it
    "timeImpact": string, // concrete delay estimate, e.g. "2-4 week auth delay"
    "severity": "high" | "medium" | "low"
  }
]

Return 3-6 gaps. Only flag things genuinely absent from the bundle — verify
against the resources above before claiming something is missing. Ground each
"why" in a real payer or IDEA requirement, and say when a requirement varies by
plan rather than overstating certainty.`,
  });

  const list = Array.isArray(gaps) ? gaps : [];
  emit({ type: "gaps", data: list });
  emit({
    type: "agent_done",
    agent: "gaps",
    detail: `${list.length} gaps · ${list.filter((g) => g.severity === "high").length} high severity`,
  });
  return list;
}

// ---------------------------------------------------------------------------
// Agent 6 — Dual Output (two simultaneous streams)
// ---------------------------------------------------------------------------

export async function runDualOutput(
  ctx: PatientContext,
  plan: PathwayPlan,
  gaps: Gap[],
  letters: Letter[],
  emit: Emit,
): Promise<void> {
  emit({ type: "agent_start", agent: "dual-output" });

  const gapLines =
    gaps.map((g) => `- [${g.severity}] ${g.item} — ${g.why} (${g.timeImpact})`).join("\n") ||
    "(none detected)";
  const letterLines = letters.map((l) => `- ${l.title} → ${l.recipient}`).join("\n");
  const serviceLines = plan.services
    .map((s) => `- ${s.name}${s.priorAuthRequired ? " (prior auth required)" : ""}`)
    .join("\n");

  const facts = `PATIENT: ${ctx.patientName}, ${ctx.ageYears}y${ctx.ageMonths}m, ${ctx.state}
DIAGNOSIS: ${ctx.diagnosisCode} — ${ctx.diagnosisDisplay}, diagnosed ${ctx.encounterDate} by ${ctx.diagnosingPhysician}
INSURANCE: ${ctx.insurancePlan} (${ctx.insuranceType})
PATHWAY: ${plan.pathway}
LEAD AGENCY: ${plan.leadAgency}
TIMELINE: ${plan.referralDeadline}

SERVICES:
${serviceLines}

DOCUMENTS GENERATED:
${letterLines}

DOCUMENTATION GAPS:
${gapLines}`;

  const clinician = streamText(
    {
      effort: "medium",
      maxTokens: 2500,
      system: `${SYNTHETIC_GUARDRAIL}

You write the cover memo that sits on top of a care-coordination packet for the diagnosing clinician.`,
      prompt: `Write a clinician cover memo for this post-diagnosis packet.

${facts}

Structure with these markdown headings:
## Summary
One paragraph: what was diagnosed, what pathway applies, what is now in motion.

## Documents in this packet
The generated documents, each with one line on what it does and who signs it.

## Action required from you
Numbered list. Only items that genuinely need the clinician — signatures,
clinical attestations, orders. Be specific.

## Documentation gaps
Each gap with its time impact. Lead with the highest-severity item.

Markdown. Under 500 words. Clinical register — you are writing to a peer.`,
    },
    (text) => emit({ type: "delta", pane: "clinician", text }),
  );

  const parent = streamText(
    {
      effort: "medium",
      maxTokens: 2500,
      system: `${SYNTHETIC_GUARDRAIL}

You write for a parent who just got a diagnosis for their child. It is 7pm, they
are exhausted, and they are scared. Your job is to make the next week feel doable.

Voice rules:
- Plain English at roughly a 6th-grade reading level. No clinical jargon. If you
  must use a term like "IEP", define it in the same sentence.
- Warm and direct. Never condescending, never falsely cheerful. Do not tell them
  how to feel, and do not open by narrating their emotions back at them.
- Never imply a deadline is missed or that they have done anything wrong.
- Short paragraphs. A tired person is scanning, not reading.`,
      prompt: `Write a 7-day action plan for this parent.

${facts}

Structure with these markdown headings:
## What today's diagnosis means
2-3 short paragraphs in plain language. Explain the diagnosis and that a
pathway to services now exists. Do not restate the score numbers at them.

## Your next 7 days
A day-by-day list, Day 1 through Day 7. ONE concrete task per day — a phone
call, an email, a form. Say who to contact and what to say. Some days can be
"nothing to do today, rest." That is a legitimate entry and worth including.

## What we're handling for you
The letters already drafted and sent on their behalf, so they know what they do
NOT have to chase.

## What we still need from you
Anything that only they can provide (a hearing test appointment, a signature, a
document). Explain why it matters in one sentence, without alarming them.

## Questions to ask
3-4 specific questions to ask at the next appointment.

Markdown. Under 600 words.`,
    },
    (text) => emit({ type: "delta", pane: "parent", text }),
  );

  // Both packages generate at the same time, streaming into two panes at once.
  await Promise.all([clinician, parent]);

  emit({ type: "agent_done", agent: "dual-output", detail: "Both packages complete" });
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export async function runPipeline(bundle: unknown, emit: Emit): Promise<void> {
  const ctx = await runFhirParser(bundle, emit);
  const plan = await runPathway(ctx, emit);

  // Prior auth, the 4 referrals, and gap detection are mutually independent —
  // run them concurrently so the demo isn't six serial round trips.
  const [priorAuth, referrals, gaps] = await Promise.all([
    runPriorAuth(ctx, plan, emit),
    runParallelReferrals(ctx, plan, emit),
    runGapDetection(bundle, ctx, plan, emit),
  ]);

  await runDualOutput(ctx, plan, gaps, [priorAuth, ...referrals], emit);
  emit({ type: "done" });
}
