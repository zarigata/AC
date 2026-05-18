# Zazi Branch Workflow

> How to survive with 3 branches instead of 20.

## The Three Branches

### `main` — The Truth
- Only production-tested, verified, working code
- Nothing merges here without passing tests on `dev`
- Deployed builds come from here
- The README and GitHub Pages are sourced from here

### `dev` — The Kitchen
- Active development happens here
- Feature branches merge into `dev`
- Tested, debugged, and stabilized before `main`
- May have experiments but they must be working

### `ideas` — The Notebook
- Concepts, tasks, archived features from the old dev bloat
- Design documents, API proposals, future features
- Synced periodically from `dev` but never merges back
- Safe place for "what ifs" without breaking anything

## Workflow

```
ideas (concepts) ──merge/snapshot──→ dev (tested code) ──merge──→ main (production)
         ↑                               │
         └─────────── archive future ────┘
```

1. When you have an idea, write it in `ideas/` and commit to `ideas`
2. When ready to build, create a feature branch from `dev`, implement, test
3. Merge feature branch into `dev`
4. When `dev` is stable, merge `dev` → `main`
5. Periodically sync interesting ideas from `dev` back to `ideas`

## Rules

- **Never force-push `main`**
- **Never merge `ideas` into `dev` or `main`**
- **No feature branches directly to `main`**
- **`dev` should always be somewhat working** — don't leave it broken
- If you break `dev`, fix it before touching `main`
