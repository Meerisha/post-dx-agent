import { FAST_MODEL, completeJson, completeText, streamText } from "./client";
import type { AgentId, Emit, Gap, Letter, PathwayPlan, PatientContext } from "./types";

const GUARD = `Synthetic hackathon data. Everything you write is an unsigned draft for clinician review. Never invent findings, dates, or IDs — write [MISSING: x] instead.`;

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

function scores(ctx: PatientContext): string {
  if (ctx.assessments.length === 0) return "(none)";
  return ctx.assessments.map((a) => `${a.name}: ${a.value}`).join("; ");
}

/** The four fields Agent 2 needs. A subset of PatientContext, so ctx satisfies it. */
type PathwayInput = Pick<
  PatientContext,
  "ageInMonths" | "state" | "diagnosisCode" | "insurancePlan"
>;

function resources(bundle: unknown, type: string): Record<string, any>[] {
  const entries = (bundle as any)?.entry;
  if (!Array.isArray(entries)) return [];
  return entries
    .map((e) => e?.resource)
    .filter((r) => r?.resourceType === type);
}

/**
 * Pulls the Part C / Part B gate inputs straight out of the Bundle so Agent 2
 * need not wait on Agent 1's extraction. These are flat FHIR R4 fields — no
 * inference required, and the statutory 36-month cutoff is too load-bearing to
 * route through a model that might restate a date.
 *
 * Returns null if birthDate is absent, which sends the caller back to the
 * serial path rather than silently defaulting a missing age to Part C.
 */
function preExtractGate(bundle: unknown): PathwayInput | null {
  const patient = resources(bundle, "Patient")[0];
  const birthDate = patient?.birthDate;
  if (typeof birthDate !== "string" || !birthDate) return null;

  const encounterStart = resources(bundle, "Encounter")[0]?.period?.start;
  const encounterDate =
    typeof encounterStart === "string"
      ? encounterStart.slice(0, 10)
      : new Date().toISOString().slice(0, 10);

  const coding = resources(bundle, "Condition")[0]?.code?.coding?.[0];
  const coverage = resources(bundle, "Coverage")[0];

  return {
    ageInMonths: monthsBetween(birthDate, encounterDate),
    state: patient?.address?.[0]?.state ?? "",
    diagnosisCode: coding?.code ?? "",
    insurancePlan: coverage?.class?.[0]?.value ?? coverage?.payor?.[0]?.display ?? "",
  };
}

// ---------------------------------------------------------------------------
// Agent 1 — FHIR Parser
// ---------------------------------------------------------------------------

export async function runFhirParser(bundle: unknown, emit: Emit): Promise<PatientContext> {
  emit({ type: "agent_start", agent: "fhir-parser" });

  const extracted = await completeJson<PatientContext>({
    model: FAST_MODEL,
    effort: "low",
    maxTokens: 400,
    system: `${GUARD}\nFHIR R4 parser. Output only JSON.`,
    prompt: `Extract from this Bundle. Use "" if absent. Do not compute age.

{"patientName","birthDate","diagnosisCode","diagnosisSystem","diagnosisDisplay","insurancePlan","insuranceType","memberId","state","assessments":[{"name","value","interpretation"}],"diagnosingPhysician","physicianSpecialty","encounterDate","preferredLanguage"}

${JSON.stringify(bundle)}

Output only JSON.`,
  });

  // Age drives the Part C / Part B gate — compute it, don't trust model date math.
  const encounterDate = extracted.encounterDate || new Date().toISOString().slice(0, 10);
  const ageInMonths = extracted.birthDate ? monthsBetween(extracted.birthDate, encounterDate) : 0;

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

export async function runPathway(ctx: PathwayInput, emit: Emit): Promise<PathwayPlan> {
  emit({ type: "agent_start", agent: "pathway" });

  // Statutory cutoff — decided in code, not by the model.
  const isPartC = ctx.ageInMonths < 36;
  const pathway = isPartC
    ? "IDEA Part C — Early Intervention (birth to 3)"
    : "IDEA Part B — School-based services (3 to 21)";

  const plan = await completeJson<PathwayPlan>({
    model: FAST_MODEL,
    effort: "low",
    maxTokens: 400,
    system: `${GUARD}\nEarly-childhood special-education navigator. Output only JSON.`,
    prompt: `${ctx.ageInMonths}mo, ${ctx.state}, ${ctx.diagnosisCode}, ${ctx.insurancePlan}.
Pathway already set by statute: ${pathway}

{"pathway":"${pathway}","rationale":"1 sentence","leadAgency":"${ctx.state} agency","referralDeadline":"timeline","services":[{"name","priorAuthRequired":bool,"rationale":"under 12 words"}]}

4 services. Output only JSON.`,
  });

  const result: PathwayPlan = { ...plan, pathway, services: plan.services ?? [] };
  const authCount = result.services.filter((s) => s.priorAuthRequired).length;

  emit({ type: "pathway", data: result });
  emit({
    type: "agent_done",
    agent: "pathway",
    detail: `${isPartC ? "Part C" : "Part B"} · ${authCount}/${result.services.length} need prior auth`,
  });
  return result;
}

// ---------------------------------------------------------------------------
// Agent 3 — Prior Authorization
// ---------------------------------------------------------------------------

export async function runPriorAuth(
  ctx: PatientContext,
  plan: PathwayPlan,
  emit: Emit,
): Promise<Letter> {
  emit({ type: "agent_start", agent: "prior-auth" });

  const services = plan.services.filter((s) => s.priorAuthRequired).map((s) => s.name).join(", ");

  const content = await completeText({
    effort: "low",
    maxTokens: 700,
    system: `${GUARD}\nYou write prior authorization requests that survive payer review.`,
    prompt: `Prior auth letter.

Payer: ${ctx.insurancePlan}, ${ctx.state} | Member: ${ctx.patientName}, DOB ${ctx.birthDate}, ID ${ctx.memberId}
Dx: ${ctx.diagnosisCode} ${ctx.diagnosisDisplay} | By: ${ctx.diagnosingPhysician}, ${ctx.encounterDate}
Requesting: ${services}
Scores: ${scores(ctx)}

Header, requested services, clinical justification citing the scores by value, signature block.
Plain text. Under 250 words. Output only the letter. No preamble.`,
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
    to: (ctx: PatientContext, plan: PathwayPlan) => plan.leadAgency || `${ctx.state} lead agency`,
    ask: "Open an eligibility evaluation. State pathway and timeline.",
  },
  {
    id: "developmental-pediatrician",
    title: "Developmental Pediatrician Follow-Up",
    to: () => "Developmental-Behavioral Pediatrics",
    ask: "Ongoing developmental management. Include re-assessment interval.",
  },
  {
    id: "aba-therapy",
    title: "ABA Therapy Referral",
    to: () => "Applied Behavior Analysis provider",
    ask: "ABA assessment. Include recommended intensity and behavioral targets.",
  },
  {
    id: "school-district",
    title: "School District Notification",
    to: (ctx: PatientContext) => `${ctx.state} local education agency`,
    ask: "Request IEP eligibility determination. Reference district response timeline.",
  },
] as const;

export async function runParallelReferrals(
  ctx: PatientContext,
  plan: PathwayPlan,
  emit: Emit,
): Promise<Letter[]> {
  emit({ type: "agent_start", agent: "referrals" });

  const facts = `Patient: ${ctx.patientName}, DOB ${ctx.birthDate}, ${ctx.ageInMonths}mo, ${ctx.state}
Dx: ${ctx.diagnosisCode} ${ctx.diagnosisDisplay} | By: ${ctx.diagnosingPhysician}, ${ctx.encounterDate}
Insurance: ${ctx.insurancePlan} | Pathway: ${plan.pathway}
Scores: ${scores(ctx)}`;

  // True parallel execution — four requests in flight at once, each emitted on arrival.
  const letters = await Promise.all(
    REFERRALS.map(async (spec) => {
      const recipient = spec.to(ctx, plan);
      const content = await completeText({
        effort: "low",
        maxTokens: 400,
        system: `${GUARD}\nYou write concise pediatric referral letters.`,
        prompt: `Referral: ${spec.title}
To: ${recipient}
${spec.ask}

${facts}

Plain text. Under 180 words. Cite the diagnosis code and scores. Signature block for ${ctx.diagnosingPhysician}.
Output only the letter. No preamble.`,
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

  emit({ type: "agent_done", agent: "referrals", detail: `${letters.length} letters in parallel` });
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

  // JSON needs headroom that prose doesn't: a truncated letter just reads
  // short, but truncated JSON fails to parse. Haiku is wordier per gap.
  const gaps = await completeJson<Gap[]>({
    model: FAST_MODEL,
    effort: "low",
    maxTokens: 900,
    system: `${GUARD}\nUtilization reviewer. You find what is MISSING. Output only a JSON array.`,
    prompt: `Find documentation gaps that would delay care or trigger denial.

${ctx.ageInMonths}mo, ${ctx.state}, ${ctx.insurancePlan}, ${ctx.diagnosisCode}
Pathway: ${plan.pathway} | Services: ${plan.services.map((s) => s.name).join(", ")}
Present: ${scores(ctx)}
Bundle: ${JSON.stringify(bundle)}

[{"item":"under 10 words","why":"under 15 words","timeImpact":"e.g. 2-4 week delay","severity":"high|medium|low"}]

4 gaps, worst first. Only flag what is genuinely absent. Output only JSON.`,
  });

  const list = Array.isArray(gaps) ? gaps : [];
  emit({ type: "gaps", data: list });
  emit({
    type: "agent_done",
    agent: "gaps",
    detail: `${list.length} gaps · ${list.filter((g) => g.severity === "high").length} high`,
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

  const facts = `${ctx.patientName}, ${ctx.ageYears}y${ctx.ageMonths}m, ${ctx.state}
Dx: ${ctx.diagnosisCode} ${ctx.diagnosisDisplay}, by ${ctx.diagnosingPhysician} on ${ctx.encounterDate}
Insurance: ${ctx.insurancePlan} | Pathway: ${plan.pathway} | Agency: ${plan.leadAgency}
Documents sent: ${letters.map((l) => l.title).join(", ")}
Gaps: ${gaps.map((g) => `${g.item} (${g.timeImpact})`).join("; ") || "none"}`;

  const clinician = streamText(
    {
      effort: "low",
      maxTokens: 700,
      system: `${GUARD}\nYou write the cover memo on a care-coordination packet.`,
      prompt: `Clinician cover memo.

${facts}

Headings: ## Summary, ## Documents, ## Action required, ## Gaps
Under 200 words. Clinical register. Output only the memo. No preamble.`,
    },
    (text) => emit({ type: "delta", pane: "clinician", text }),
  );

  const parent = streamText(
    {
      effort: "low",
      maxTokens: 700,
      system: `${GUARD}
You write for a parent who just got their child's diagnosis. It is 7pm and they are exhausted.
Plain English, 6th-grade level. Define any term you must use. Warm and direct, never condescending or falsely cheerful. Don't narrate their emotions back at them. Short paragraphs.`,
      prompt: `7-day action plan for this parent.

${facts}

Headings: ## What this means, ## Your next 7 days, ## We're handling, ## We need from you
Day 1-7, one task each, with who to call. "Rest today" is a valid day.
Under 250 words. Output only the plan. No preamble.`,
    },
    (text) => emit({ type: "delta", pane: "parent", text }),
  );

  await Promise.all([clinician, parent]);
  emit({ type: "agent_done", agent: "dual-output", detail: "Both packages complete" });
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export async function runPipeline(bundle: unknown, emit: Emit): Promise<void> {
  // The pathway gate needs only age/state/dx, all readable from the Bundle
  // directly — so Agent 2 starts alongside Agent 1 instead of behind it.
  // If birthDate is missing we fall back to the serial path rather than guess.
  const gate = preExtractGate(bundle);

  const [ctx, plan] = gate
    ? await Promise.all([runFhirParser(bundle, emit), runPathway(gate, emit)])
    : await (async () => {
        const parsed = await runFhirParser(bundle, emit);
        return [parsed, await runPathway(parsed, emit)] as const;
      })();

  // Independent — run concurrently rather than as three serial round trips.
  // Settled, not all: one agent failing (a truncated JSON parse, a rate limit)
  // should degrade that panel, not blank the whole screen mid-demo.
  const [priorAuth, referrals, gaps] = await Promise.all([
    guard("prior-auth", emit, null, () => runPriorAuth(ctx, plan, emit)),
    guard("referrals", emit, [] as Letter[], () => runParallelReferrals(ctx, plan, emit)),
    guard("gaps", emit, [] as Gap[], () => runGapDetection(bundle, ctx, plan, emit)),
  ]);

  const letters = [...(priorAuth ? [priorAuth] : []), ...referrals];
  await guard("dual-output", emit, undefined, () =>
    runDualOutput(ctx, plan, gaps, letters, emit),
  );
  emit({ type: "done" });
}

/** Runs an agent, converting a throw into an agent_error event + fallback value. */
async function guard<T>(
  agent: AgentId,
  emit: Emit,
  fallback: T,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    emit({
      type: "agent_error",
      agent,
      message: error instanceof Error ? error.message : "Agent failed",
    });
    return fallback;
  }
}
