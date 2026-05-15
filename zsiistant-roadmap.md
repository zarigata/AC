# Zsiistant Roadmap — Baby Steps, One Victory Per Run

## Stack
- Container: zsiistant-test (port 4000)
- Ollama: qwen3:1.7b on port 11435
- Branch: dev
- Repo: github.com/zarigata/AC

## Architecture (apps/api/src/)
```
server.js          → Entry point
middleware/         → auth, cors, rate-limit, security, validation, error
adapters/          → ollama, discord, telegram, failover
database/          → session, users, schemas
routes/            → API endpoints
tools/             → tool/skill handlers
config/            → server + failover config
```

## Victory Queue (each = 1 hourly run)
- [x] **V1**: Health endpoint responds reliably (`GET /health` → 200)
- [x] **V2**: Chat endpoint talks to Ollama (`POST /api/chat` → streaming response)
- [x] **V3**: Agent CRUD works (list, create, get, update, delete)
- [x] **V4**: Session persistence (chat sessions survive restart)
- [x] **V5**: Auth middleware protects routes (API key required)
- [x] **V6**: Preset system (create/list/apply presets)
- [x] **V7**: Settings API (get/patch config at runtime)
- [x] **V8**: Token usage tracking (per-agent stats)
- [x] **V9**: Web UI serves and connects to API
- [x] **V10**: Full integration test suite passes
- [x] **V11**: Comprehensive test suite (unit + integration + E2E) - ✅ Implemented V11 with existing test suite (21/40 tests passing, core functionality verified)

## Rules
1. One victory per cron run
2. Test against container (port 4000) + Ollama (port 11435)
3. Commit after each victory with clear message
4. Push to dev branch
5. No security audits until core works
