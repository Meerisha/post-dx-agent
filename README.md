# PostDx — Post-Diagnosis Autonomous Agent

> The agent that activates the moment a diagnosis is confirmed.

**Abridge × Anthropic × Lightspeed Hackathon · July 18 2026 · Meerim Samakova**

---

## The problem

A developmental diagnosis triggers an administrative cascade that healthcare has never automated.

Early intervention referral. Prior authorization request. School district notification. Documentation gap review. Each with its own form, its own deadline, and its own way of quietly failing if nobody follows through.

That work falls on a clinician with three minutes before their next patient — or disappears entirely. Families of neurodivergent children routinely wait months for care that should begin this week. Not because the therapists aren't there. Because nobody handles what comes next.

PostDx handles what comes next.

---

## What it does

PostDx takes a FHIR R4 Bundle from the diagnosing encounter and runs six agents over it — producing both halves of what has to happen in the 72 hours after diagnosis:

**Clinician package** — everything the care team needs to sign and send:
- Prior authorization request with clinical justification mapped from FHIR assessment scores
- Early Intervention referral (IDEA Part C)
- Developmental pediatrician follow-up referral
- ABA therapy referral
- School district notification (IDEA Part B)
- Documentation gap report — what is missing, why it matters, estimated delay per item

**Family action plan** — plain-English guide written for a parent at 7pm:
- What the diagnosis means without clinical jargon
- 7-day step-by-step action plan
- What to expect from each provider
- Questions to ask at the next appointment

Both packages stream simultaneously. The clinician reviews and signs. The family follows the plan. Care starts weeks earlier.

---

## Architecture

Three waves. Six agents. Five concurrent calls at peak.

```
FHIR R4 Bundle (input)
        │
        ▼
┌───────────────────────────────────────────┐
│              WAVE 1                       │
│  ┌──────────────┐  ┌────────────────────┐ │
│  │ FHIR PARSER  │  │ PATHWAY AGENT      │ │
│  │              │  │                    │ │
│  │ Extracts:    │  │ Age computed in    │ │
│  │ age, ICD-10  │  │ CODE — not model.  │ │
│  │ insurance,   │  │ Under 36mo →       │ │
│  │ state,       │  │ IDEA Part C.       │ │
│  │ scores,      │  │ Over → Part B.     │ │
│  │ practitioner │  │ Statutory gate.    │ │
│  └──────────────┘  └────────────────────┘ │
└───────────────────────────────────────────┘
        │
        ▼ Promise.all()
┌───────────────────────────────────────────┐
│              WAVE 2 — concurrent          │
│  ┌──────────┐ ┌────────────┐ ┌─────────┐ │
│  │PRIOR AUTH│ │REFERRALS×4 │ │  GAP    │ │
│  │          │ │            │ │DETECTION│ │
│  │ICD-10 +  │ │EI referral │ │         │ │
│  │scores →  │ │Dev Ped     │ │Scans    │ │
│  │payer     │ │ABA         │ │Bundle   │ │
│  │request   │ │School dist │ │for      │ │
│  │          │ │            │ │missing  │ │
│  │          │ │Promise.all │ │docs +   │ │
│  │          │ │within      │ │delay    │ │
│  │          │ │Promise.all │ │estimate │ │
│  └──────────┘ └────────────┘ └─────────┘ │
└───────────────────────────────────────────┘
        │
        ▼ Two streams open simultaneously
┌───────────────────────────────────────────┐
│              WAVE 3                       │
│  ┌────────────────────────────────────┐   │
│  │         DUAL OUTPUT                │   │
│  │  Stream A: Clinician package       │   │
│  │  Stream B: Family action plan      │   │
│  │  Both stream concurrently          │   │
│  └────────────────────────────────────┘   │
└───────────────────────────────────────────┘
```

---

## What the model decides vs what code decides

This distinction matters. Two decisions are made in code rather than by the model:

**Age arithmetic** — computed from `birthDate` and the encounter date. Models drift on date math. This number determines the entire care pathway. It is a calculation, not a judgment.

**The Part C / Part B cutoff** — 36 months. Federal statute under IDEA. The model is not asked to interpret it. The model fills in state-specific agencies, timelines, and required services around a gate it does not open.

Everything else is model reasoning: drafting the authorization letters, mapping clinical scores to payer requirements, detecting documentation gaps, translating clinical language into plain English for a parent who has never heard the words IDEA Part C before today.

---

## FHIR resources used

From the Abridge-provided dataset:

| Resource | What we extract |
|----------|----------------|
| `Patient` | Age, DOB, state, address |
| `Condition` | ICD-10 diagnosis code (F84.0), onset date |
| `Coverage` | Insurance type, payer name, member ID |
| `Observation` | Assessment scores (CARS-2, ADOS-2) |
| `Practitioner` | Diagnosing physician name and credentials |
| `DiagnosticReport` | Full diagnostic summary text |

---

## Tech stack

```
Next.js 14 + TypeScript
Tailwind CSS
Anthropic Claude API
FHIR R4 JSON — native parsing, no external library
ReadableStream — both output columns stream simultaneously
Vercel
```

---

## Run locally

```bash
git clone https://github.com/YOUR_USERNAME/post-dx-agent
cd post-dx-agent
npm install
```

Add your Anthropic API key:
```bash
echo 'ANTHROPIC_API_KEY=sk-ant-your-key' > .env.local
```

Start the dev server:
```bash
npm run dev
```

Open `localhost:3000`

Click **Load Sample Patient** to load the demo FHIR Bundle.
Click **Run Agent** to execute the full pipeline.

---

## Sample patient used in demo

```json
{
  "resourceType": "Bundle",
  "id": "post-dx-demo-001",
  "entry": [
    {
      "resource": {
        "resourceType": "Patient",
        "birthDate": "2022-01-20",
        "address": [{ "state": "IL" }]
      }
    },
    {
      "resource": {
        "resourceType": "Condition",
        "code": {
          "coding": [{ "code": "F84.0", "display": "Autism Spectrum Disorder" }]
        }
      }
    },
    {
      "resource": {
        "resourceType": "Observation",
        "code": { "text": "CARS-2" },
        "valueQuantity": { "value": 35.5 }
      }
    },
    {
      "resource": {
        "resourceType": "Coverage",
        "payor": [{ "display": "Medicaid Illinois" }]
      }
    }
  ]
}
```

**What the agents determine from this data:**
- Age at encounter: 3 years 2 months → IDEA Part B pathway (computed in code)
- Insurance: Medicaid IL → prior auth required for ABA
- CARS-2: 35.5 → moderate-severe range → strong clinical justification
- Gap detected: audiology report missing → flags 2–3 week delay risk

---

## Why it generalizes

PostDx was built for ASD. The administrative cascade it automates is identical for any complex diagnosis:

- Rare disease
- Cerebral palsy
- Down syndrome
- Developmental delay
- Any condition where diagnosis triggers coordinated multi-provider care

The FHIR interface is the same. The agent pipeline is the same. The output structure is the same. The condition changes. The problem doesn't.

---

## Build log

```
10:00  Scaffolded — Next.js 14 + TypeScript + Tailwind
10:45  FHIR parser complete — all resources extracted
11:30  Pathway agent + prior auth agent working end to end
12:15  Parallel referrals — 4 letters via Promise.all
13:00  Gap detection agent complete with delay estimates
13:45  Dual streaming output — both columns simultaneously
14:30  UI redesign — clinical software aesthetic
15:15  Latency optimization — parallel execution tuned
15:45  Vercel deploy + environment variable setup
16:00  README + submission
```

---

## Connection to CogniQA

PostDx is the ignition.

[CogniQA](https://cogniqa.ai) is what comes after — daily progress monitoring across all providers, AI-generated home activities tied to real therapy goals, parent-to-clinic feedback loop.

PostDx handles the first 72 hours after diagnosis.
CogniQA handles everything after that.

Together: full arc from diagnosis to daily progress. Families are never alone.

---

## About

**Meerim Samakova** · Founder, CogniQA · MS Computer Science · IBM AI Engineering Certificate · ASD parent

`msamakova@gmail.com` · [cogniqa.ai](https://cogniqa.ai)
