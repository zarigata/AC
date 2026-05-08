# Precision Protocol (Toward Near-Perfect Reliability)

## Reality check

"1000% achievement" is not mathematically meaningful for system quality. For RelayCore, a practical equivalent is:

- **Task success rate:** >99% on well-scoped tasks
- **Critical error rate:** <0.1% on high-impact actions
- **Policy compliance rate:** >99.9% on safety and routing rules
- **Recovery success rate:** >99% after provider/tool failures

This document proposes concrete operating protocols to move RelayCore toward those goals.

## Current-state assessment

RelayCore already has a strong foundation for precision:

- strict input validation and bounded enums in shared contracts
- explicit agent isolation and link controls
- provider catalog and template catalog with typed shape checks
- provider-specific runtime paths and health checks
- test coverage for registry, runtime, onboarding, digest, and channel logic

Current reliability gaps to close:

- no unified error taxonomy across providers
- no confidence scoring before action execution
- no deterministic execution mode for reproducibility
- no end-to-end policy gate before side effects
- limited observability for per-step reasoning quality
- mock-only YouTube ingest and fragile Reddit RSS parsing path

## Protocol stack

### P0. Contract-First Execution Protocol

1. Every agent task begins with a machine-checkable task schema:
   - objective
   - constraints
   - allowed tools
   - expected output schema
   - risk level
2. Reject execution if schema is incomplete.
3. Require model output to validate against the expected output schema before any side effect.

### P1. Two-Phase Commit for Agent Actions

1. **Phase A (plan):** model proposes action JSON only.
2. **Phase B (commit):** runtime validates policy, budget, and confidence thresholds.
3. Side effects run only after commit token is issued.
4. If checks fail, fallback to clarification/refine loop.

### P2. Confidence + Verification Protocol

For each non-trivial response:

- model emits:
  - answer
  - confidence score
  - assumptions
  - evidence references
- runtime verifier checks:
  - schema validity
  - source presence
  - contradiction rules
- low confidence or failed verification routes to reviewer agent.

### P3. Provider Reliability Envelope

Standardize provider calls behind an envelope:

- timeout budgets (connect/read/total)
- retry policy with jitter
- idempotency key support where applicable
- circuit-breaker states (closed/open/half-open)
- normalized error codes (auth, quota, timeout, validation, provider-down)

### P4. Deterministic Replay Mode

To debug and improve precision:

- capture input, model params, tool calls, and outputs
- pin model version where possible
- support "replay run" against frozen inputs
- compare diffs against expected snapshots

### P5. Policy Guardrail Chain

Before any external action:

1. capability check (is tool allowed for this agent?)
2. data policy check (PII/secrets constraints)
3. safety policy check (blocked intents/actions)
4. budget check (token/time/cost)
5. human-approval check for high-risk classes

### P6. Multi-Agent Consensus for High-Risk Tasks

For important actions (deployment, deletion, legal/financial content):

- proposer agent drafts action
- critic agent attempts to break it
- reviewer agent decides approve/reject with reason
- disagreement auto-escalates to human

### P7. Token Discipline Controls

- force small routing models for classification
- strict max token caps by task class
- progressive disclosure prompts (minimal context first)
- retrieve only required memory slices
- stop sequences and bounded chain-of-thought emission where supported

### P8. Observability & Quality SLOs

Track metrics per agent, provider, and workflow:

- task success/failure
- first-pass acceptance rate
- retries per task
- policy-block frequency
- hallucination catch rate
- median/95p latency
- token/cost per successful task

Define SLO alerts:

- success rate drop below target
- retry spikes
- provider-specific degradation

## Operating playbooks

### Incident protocol

1. Detect SLO breach.
2. Freeze risky automation path.
3. Route traffic to safer fallback provider/model.
4. Replay failed runs in deterministic mode.
5. Patch policy/schema/test.
6. Re-enable with canary traffic.

### Experiment protocol

1. Introduce one protocol change at a time.
2. Run A/B on representative tasks.
3. Require statistical improvement on:
   - quality
   - latency
   - cost
4. Promote only if all guardrail metrics stay within limits.

## 30-60-90 implementation roadmap

### 0-30 days

- add normalized runtime error taxonomy
- add per-task schema requirements
- add phase-A/phase-B action commit flow
- ship baseline reliability dashboard

### 31-60 days

- add confidence + verifier stage
- add deterministic replay capture
- add policy chain gates before side effects
- formalize high-risk human approval flags

### 61-90 days

- add multi-agent consensus path
- add adaptive provider routing by SLO performance
- add continuous eval harness with weekly scorecards
- launch reliability canaries for new templates/providers

## Success scorecard

Target scorecard (rolling 30-day):

- task success rate >= 99.0%
- critical incidents <= 1 per 1000 high-risk actions
- policy compliance >= 99.9%
- median retries <= 0.2 per task
- p95 latency within task-class budget
- cost per successful task down trend month over month

## Definition of "precision" in RelayCore

A RelayCore run is precise when it is:

1. **Correct:** output satisfies schema and task objective.
2. **Safe:** policy chain approves and no blocked behavior appears.
3. **Efficient:** within token/time/cost budget.
4. **Explainable:** assumptions and evidence are inspectable.
5. **Repeatable:** replay yields equivalent result under pinned conditions.
