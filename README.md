# Post-Diagnosis Autonomous Agent

**Built at the Abridge × Anthropic × Lightspeed Hackathon, July 18 2026. Meerim Samakova** 
A developmental diagnosis triggers an administrative 
cascade that healthcare has never automated.

47 days. I waited  for my son's first therapy appointment 
after his ASD diagnosis. Not because the care didn't 
exist. Because the referrals, prior authorizations, 
and documentation gaps weren't handled until weeks 
after we left the clinic.

PostDx is a six-agent pipeline that reads a FHIR R4 
Bundle from the diagnosing encounter and autonomously 
executes every clinical and administrative action 
required in the 72 hours after diagnosis.

Architecture:

Agent 1 — FHIR Parser: extracts patient age, ICD-10 
diagnosis code, insurance coverage, state, assessment 
scores (CARS-2, ADOS-2), and diagnosing practitioner 
from the Bundle resources.

Agent 2 — Pathway Determination: age arithmetic is 
computed in code, not by the model — models drift on 
date math, and this number determines the entire care 
pathway. Under 36 months → IDEA Part C Early 
Intervention. Over 36 months → IDEA Part B school 
services. The model fills in state-specific agencies 
and timelines around a gate it does not open.

Agents 3, 4, 5 — run concurrently via Promise.all:
- Prior Authorization: drafts the payer request using 
  ICD-10 codes and assessment scores as clinical 
  justification, mapped to coverage type
- Parallel Referrals: four letters simultaneously — 
  early intervention, developmental pediatrician, 
  ABA therapy, school district notification
- Gap Detection: identifies missing documentation 
  that would delay care or trigger a denial, with 
  estimated time impact per gap

Agent 6 — Dual Output: opens two streams simultaneously:
- Clinician package: formal letters ready to review 
  and sign, structured for each recipient
- Family action plan: plain-English 7-day guide 
  translated from clinical language — written for 
  a parents.

---

## The six agents

| # | Agent | What it does |
|---|---|---|
| 1 | **FHIR Parser** | Reads the Bundle — patient age, diagnosis code, insurance, state, assessment scores, diagnosing physician |
| 2 | **Pathway Determination** | Age + state → IDEA Part C (under 3) or Part B (3+); flags which services need prior auth |
| 3 | **Prior Authorization** | Drafts the payer request, using diagnosis codes and assessment scores as the clinical justification |
| 4 | **Parallel Referral** | Four letters concurrently via `Promise.all` — early intervention, developmental pediatrician, ABA, school district |
| 5 | **Gap Detection** | Finds missing documentation that would delay care or trigger a denial, with a time impact on each |
| 6 | **Dual Output** | Two simultaneous streams — clinician package (blue) and parent 7-day plan (green) |

Agents 3, 4, and 5 are mutually independent and run concurrently; agent 6 opens
two streams at once. A full run is five round trips deep, not six.

### Where the model is and isn't in the loop

Two decisions are made in code rather than by the model, because they're rules
rather than judgment:

- **Age arithmetic** — computed from `birthDate` and the encounter date. Models
  drift on date math, and this number decides Part C vs. Part B.
- **The Part C / Part B gate** — a statutory cutoff at 36 months. The model
  fills in state-specific agencies, timelines, and services around a decision
  it isn't asked to make.

---

## Running it

```bash
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
npm run dev
```

Open http://localhost:3000 and click **Load sample patient**, or drop your own
FHIR Bundle onto the drop zone.

Model: `claude-sonnet-4-6` via the Anthropic API. The key is read server-side
only — it is never exposed to the browser.

---

## The demo patient

`data/sample-fhir-bundle.json` — synthetic, generated for this project:

- 3-year-old (3y5m at the encounter), ASD, **ICD-10 F84.0**
- **CARS-2 total 35.5** (mild-to-moderate range), Vineland-3 composite 68
- **Illinois Medicaid** — HealthChoice Illinois
- Diagnosed by **Dr. James Weedon, MD**, Developmental-Behavioral Pediatrics
- **Contains a deliberate gap**: no audiology or hearing evaluation. Hearing loss
  is a differential for speech-language delay, and its absence is a routine
  cause of authorization delay. Agent 5 should find it unprompted.

The age is the interesting part of this case. The child is 3y5m — five months
past the Part C ceiling — so this is a Part B pathway, and that transition is
exactly where families fall through the gap in practice.

---

## Architecture

```
app/
  page.tsx                  Agent UI — upload, live status, dual streaming output
  api/agent/route.ts        POST a Bundle, get an NDJSON event stream back
  encounters/               Browser for the Abridge synthetic encounter dataset
lib/
  agents/pipeline.ts        The six agents + orchestration
  agents/client.ts          Anthropic client, JSON coercion, streaming helper
  agents/types.ts           Shared types + the stream event protocol
  dataset.ts                Loader for the Abridge encounter dataset
data/
  sample-fhir-bundle.json   Demo patient
```

The route streams newline-delimited JSON events (`agent_start`, `letter`,
`delta`, `done`, …) so the UI can light up each agent as it activates and render
both output panes token by token.

---

## Limits, stated plainly

- **Every output is a draft.** Nothing here is reviewed, signed, or submitted.
  A licensed clinician has to read, edit, and sign each document before it goes
  anywhere near a payer or an agency.
- **All data is synthetic.** The demo patient was written for this project. The
  encounter browser uses Abridge's synthetic hackathon dataset (Synthea-derived
  patients, LLM-generated transcripts and notes). No real patient data is
  present, and none should be sent to this app — there is no BAA behind it.
- **Payer and agency rules vary** by plan, by state, and over time. The prior
  auth requirements and timelines the agents produce are a starting point for
  verification, not an authority.
- **Not a clinical decision support tool.** It drafts paperwork from a diagnosis
  a clinician already made. It does not diagnose, and it does not decide what
  care a child should receive.
