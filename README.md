# ClawForge

ClawForge is the start of a local-first multi-agent platform built to compete with PicoClaw and OpenClaw with a simpler control surface, stronger multi-agent orchestration, broader model support, and a future internal skill store.

## What exists in this first slice

- TypeScript monorepo with shared contracts
- Fastify API with a SQLite-backed agent registry
- React control UI focused on multi-agent operations
- Agent-to-agent communication policies
- Seeded local data model for up to 100 agents per machine
- Tests around the registry behavior

## Product direction

- Up to 100 agents on one machine
- Per-agent isolation, model config, and communication policy
- Internal skill store with versioning and trust metadata
- OpenClaw skill compatibility bridge
- Many provider backends with routing, failover, and quotas
- Clean admin experience instead of sprawling config screens

## Quick start

```bash
npm run dev
```

The API and web UI are both served from `http://localhost:4000`.

## Repo layout

- `apps/api`: agent control API and local runtime state
- `apps/web`: control UI assets served by the API
- `packages/shared`: shared contracts and validation helpers
- `docs/architecture.md`: current technical direction
