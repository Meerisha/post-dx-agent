# PostDx

FHIR R4 Bundle in. Two care-coordination packages out. Six agents, three waves, ~63s.

Built solo at the **Abridge × Anthropic × Lightspeed Hackathon** · July 18 2026.

---

## The problem, stated as an engineering problem

A developmental diagnosis produces a `Condition` resource and nothing else. Everything that
actually gets a child into therapy — the prior auth, the IDEA referral, the district
notification, the gap review — is unstructured work that falls on a clinician between
patients, or on a parent holding a 12-page report.

That work is mechanical. It reads structured fields out of a Bundle, applies statute, and
emits documents. It is a pipeline, and it has been waiting for one.

---

## Execution model

The naive shape is six sequential model calls. This is three waves, because agent
dependencies form a DAG, not a line.

```
                          POST /api/agent  { FHIR R4 Bundle }
                                      │
        ┌─────────────────────────────┴─────────────────────────────┐
        │  WAVE 1                                      ~8s          │
        │                                                           │
        │   ┌──────────────────────┐   ┌──────────────────────┐     │
        │   │ 1  FHIR Parser       │   │ 2  Pathway           │     │
        │   │    haiku-4.5   400t  │ ‖ │    haiku-4.5   400t  │     │
        │   └──────────┬───────────┘   └──────────┬───────────┘     │
        │              │                          │                 │
        │   full ctx ──┘        preExtractGate() ─┘                 │
        │   (name, dx, payer,   reads birthDate/state/dx straight   │
        │    scores, provider)  from the Bundle — no model needed,  │
        │                       so Agent 2 does not wait on Agent 1 │
        └─────────────────────────────┬─────────────────────────────┘
                                      │  ctx + plan
        ┌─────────────────────────────┴─────────────────────────────┐
        │  WAVE 2                                     ~35s          │
        │                                                           │
        │  ┌────────────────┐ ┌──────────────────┐ ┌─────────────┐  │
        │  │ 3  Prior Auth  │ │ 4  Referrals ×4  │ │ 5  Gaps     │  │
        │  │ sonnet-4.6     │‖│ sonnet-4.6       │‖│ haiku-4.5   │  │
        │  │ 700t           │ │ 400t each        │ │ 900t        │  │
        │  └────────────────┘ └──────────────────┘ └─────────────┘  │
        │                            │                              │
        │                     Promise.all([                         │
        │                       earlyIntervention,                  │
        │                       developmentalPeds,   ← 4 in flight   │
        │                       abaTherapy,            at once      │
        │                       schoolDistrict,                     │
        │                     ])                                    │
        └─────────────────────────────┬─────────────────────────────┘
                                      │  5 letters + gap list
        ┌─────────────────────────────┴─────────────────────────────┐
        │  WAVE 3                                     ~20s          │
        │                                                           │
        │      ┌─────────────────────┐   ┌─────────────────────┐    │
        │      │ 6a Clinician memo   │ ‖ │ 6b Family plan      │    │
        │      │    sonnet-4.6 700t  │   │    sonnet-4.6 700t  │    │
        │      │    streaming        │   │    streaming        │    │
        │      └──────────┬──────────┘   └──────────┬──────────┘    │
        │                 │                         │               │
        │        two open streams, interleaved into one response    │
        └─────────────────┴─────────────┬───────────┴───────────────┘
                                        │
                          NDJSON  { type, … }\n  → browser
                    delta events land in whichever pane they name
```

Wave 2 is gated on wave 1 only because letters cite the parsed scores. Nothing inside a
wave blocks anything else inside it. Total wall-clock is the sum of the three slowest
paths, not the sum of six calls — measured **63s** end-to-end against the demo Bundle,
down from 206s for the same pipeline run serially at full prompt length.

---

## Model routing

Tier is chosen per agent by what the agent actually does. Mechanical work — extraction,
rule application, enumeration — goes to Haiku. Sonnet is reserved for the three outputs a
human reads closely and judges on register.

| # | Agent | Model | `max_tokens` | Why this tier |
|---|-------|-------|--------------|---------------|
| 1 | FHIR Parser | `claude-haiku-4-5` | 400 | Field extraction from a known schema |
| 2 | Pathway | `claude-haiku-4-5` | 400 | Fills detail around a gate decided in code |
| 3 | Prior Auth | `claude-sonnet-4-6` | 700 | Payer-facing; must survive utilization review |
| 4 | Referrals ×4 | `claude-sonnet-4-6` | 400 | Agency-facing prose, four recipients |
| 5 | Gap Detection | `claude-haiku-4-5` | 900 | Enumeration — but JSON, so it needs headroom |
| 6 | Dual Output | `claude-sonnet-4-6` | 700 ×2 | Clinical register + plain-English register |

Two notes that cost real debugging time:

- **Haiku 4.5 rejects `output_config.effort`.** It is an Opus/Sonnet parameter. The client
  strips it by model prefix rather than sending it and eating a 400.
- **JSON agents need more headroom than prose agents.** A truncated letter reads short; a
  truncated JSON array fails to parse and takes the request down. Gap Detection sits at 900
  for exactly this reason — it was the one agent that hard-failed at 400.

---

## Where the model is not in the loop

Two decisions are computed, not generated. Both are load-bearing enough that a plausible
hallucination would be worse than a crash.

**Age arithmetic.** `monthsBetween(birthDate, encounterDate)` — plain UTC date math. Models
drift on date arithmetic, and this integer selects the child's entire statutory pathway.

**The Part C / Part B gate.** `ageInMonths < 36` is federal statute, not judgment. The model
is handed the decision and asked to fill in the state lead agency, the timeline, and the
service list around it. It is never asked to make the call.

Everything downstream of those two — drafting, mapping scores to payer requirements,
detecting gaps, translating clinical language for a parent — is model work, because it is
judgment and register, which is what the model is good at.

---

## Streaming protocol

`POST /api/agent` returns `application/x-ndjson`. One JSON object per line, flushed as the
pipeline produces it. No SSE framing — the client is a `fetch` reader splitting on `\n`,
which keeps a partial trailing line buffered rather than parsed.

```ts
type StreamEvent =
  | { type: "agent_start";  agent: AgentId }
  | { type: "agent_done";   agent: AgentId; detail?: string }
  | { type: "agent_error";  agent: AgentId; message: string }
  | { type: "parsed";       data: PatientContext }
  | { type: "pathway";      data: PathwayPlan }
  | { type: "gaps";         data: Gap[] }
  | { type: "letter";       letter: Letter }
  | { type: "delta";        pane: "clinician" | "parent"; text: string }
  | { type: "fatal";        message: string }
  | { type: "done" }
```

`delta` carries a `pane` discriminator so both wave-3 streams share one HTTP response and
the UI routes each token to the correct column without a second connection.

Agent failures are isolated: each agent runs inside a `guard()` that converts a throw into
an `agent_error` event plus a fallback value. A rate limit or a truncated parse degrades one
panel instead of blanking the screen — which is the difference between a demo that
stumbles and a demo that dies.

---

## Layout

```
app/
  page.tsx                 Client UI — upload, pipeline strip, dual output
  api/agent/route.ts       ReadableStream → NDJSON, nodejs runtime
  components/              Markdown renderer, icon set
  encounters/              Browser over the Abridge synthetic dataset
lib/
  agents/pipeline.ts       Six agents, preExtractGate, guard, orchestration
  agents/client.ts         Model constants, effort gating, JSON coercion, streaming
  agents/types.ts          PatientContext, PathwayPlan, Gap, Letter, StreamEvent
  dataset.ts               Loader for the 25-encounter Abridge dataset
data/
  sample-fhir-bundle.json  Demo Bundle
```

`parseJsonLoose()` in `client.ts` tolerates code fences and surrounding prose. Sonnet 4.6
does not support `output_config.format`, so structured output is prompted rather than
constrained, and the parser is written to expect that.

---

## Run it

```bash
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
npm run dev
```

`http://localhost:3000` → **Load sample patient**, or drop any FHIR R4 Bundle on the target.

Stack: Next.js 16.2 (App Router) · React 19.2 · `@anthropic-ai/sdk` 0.112 · Tailwind v4 ·
TypeScript strict. Key is read server-side only and never reaches the client bundle.

> **Deploying:** the route declares `maxDuration = 300`. Vercel Hobby caps functions at 60s,
> which a 63s run will exceed. Use Pro, or move Agent 4 to Haiku to land ~45s.

---

## Demo Bundle

`data/sample-fhir-bundle.json` — synthetic, hand-built for this project.

3y5m at encounter · ASD `F84.0` · CARS-2 total **35.5** · Vineland-3 composite **68** ·
Illinois Medicaid · Dr. James Weedon, MD, Developmental-Behavioral Pediatrics.

The age is the interesting part. At 41 months the child is five months past the Part C
ceiling, so this routes to Part B — the C→B transition is precisely where families fall
through in practice, and it is the case a hardcoded "under 3" check gets wrong.

The Bundle also carries a **deliberate omission**: no audiology resource. Hearing loss is a
standing differential for speech-language delay and its absence is a routine authorization
denial. Agent 5 surfaces it unprompted, ranked high severity. On the last run it also
flagged something not planted — the `Patient.communication` block lists Spanish, and no
translated consent or interpreter documentation exists, which it called as an IDEA
compliance risk.

---

## Limits

- **Every output is an unsigned draft.** Nothing is reviewed, signed, or submitted. A
  licensed clinician has to read, edit, and sign before anything reaches a payer or agency.
- **All data is synthetic.** The demo Bundle was written for this project; the encounter
  browser uses Abridge's synthetic hackathon dataset. No real patient data is present and
  none should be sent — there is no BAA behind this deployment.
- **Payer and agency rules vary** by plan, by state, and over time. Prior auth requirements
  and timelines the agents produce are a starting point for verification, not authority.
- **Not clinical decision support.** It drafts paperwork downstream of a diagnosis a
  clinician already made. It does not diagnose and does not decide what care a child receives.
