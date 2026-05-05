# Architecture

## Product constraints

- Must eventually cover the same core product surface as PicoClaw.
- Must preserve the same small-factor spirit: lean runtime, fast startup, modest hardware expectations, and low-overhead operation.
- Must remain conservative with token generation and prefer efficient routing over brute-force model usage.
- Must use practical OpenClaw use-case research as an input to roadmap decisions, not just abstract parity checklists.

## First milestone goal

Ship a credible vertical slice for a local-first multi-agent control plane:

- maintain up to 100 local agent records
- define whether agents can talk to each other
- expose that state through a clean API
- render the system in a simple web UI

## Stack

- `apps/api`: Node HTTP server + built-in `node:sqlite`
- `apps/web`: static control UI with modern browser APIs
- `packages/shared`: shared validation and contract helpers

## Early domain model

### Agent

- `id`
- `name`
- `purpose`
- `status`
- `provider`
- `model`
- `isolationMode`
- `maxConcurrentTasks`
- `peerAccess`
- `createdAt`
- `updatedAt`

### Agent link

- `sourceAgentId`
- `targetAgentId`
- `mode`
- `createdAt`

`mode` starts with:

- `observe`
- `message`
- `delegate`

## Next milestones

1. Provider abstraction layer with health and routing policy
2. Skill package format and internal store metadata
3. OpenClaw skill compatibility adapter
4. Run history, metrics, and audit logs
5. Background scheduler and execution workers
6. Performance budget work to protect footprint and startup speed
