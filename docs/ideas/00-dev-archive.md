# Dev Branch Archive — Concepts to Restore Later

This document summarizes the experimental features in the dev branch that were archived during the Zazi rebuild. These are *ideas*, not active code. They live here so we can selectively restore them later.

## Multi-Channel Integrations

### Discord Adapter
- Bot integration with Discord.js
- Slash commands, message handling, agent switching
- Status: working prototype
- Future: restore as `zazi-discord` plugin

### Telegram Adapter
- Bot integration with node-telegram-bot-api
- Command handlers, inline keyboards, group chat support
- Status: working prototype
- Future: restore as `zazi-telegram` plugin

### Webhook Manager
- Generic webhook endpoint for external triggers
- Signature verification, failover chains
- Status: partially working
- Future: restore as `zazi-webhooks` plugin

## Advanced Middleware (future additions)

### Authentication System
- API key-based auth, session tokens
- User management with SQLite
- Status: functional but overkill for single-machine
- Future: only if multi-user mode needed

### Rate Limiting
- IP-based and per-key throttling
- Token bucket algorithm
- Status: functional
- Future: useful for public instances

### Alerting System
- Webhook alerts, email notifications
- Threshold-based triggers
- Status: functional
- Future: monitoring integration

### WebSocket Chat
- Real-time chat interface
- Broadcast, private, channel modes
- Status: feature-complete but complex
- Future: simplify and restore

### Health Monitor
- Provider health checks, automatic failover
- Task execution tracking
- Status: functional
- Future: keep as core monitoring

## Database Layer

### User Management
- SQLite user table with roles
- Session management
- Status: working
- Future: only needed for multi-user

### Agent Memory (sessions)
- Conversation history storage
- Context window management
- Status: working prototype
- Future: core feature for v2

## Preset System
- Already captured in `docs/ideas/04-presets.md`
- The dev branch had a working implementation

## Tool System
- External tool registration and execution
- Handler dispatch for custom tools
- Status: working prototype
- Future: `zazi-tools` plugin

## Token Manager
- Per-agent token budgeting
- Rate tracking and caps
- Status: working
- Future: core for v2

## Job Processor
- Background task queue
- Cron-like scheduling
- Status: functional
- Future: core for v2

## Security Reports
- Multiple audit reports exist in dev branch under `tests/reports/`
- Most findings were addressed; summaries are not actionable
- Kept here for reference only

## Verdict

Everything above was removed from dev to focus Zazi on its core purpose: a clean, fast, single-machine multi-agent hub with agent-to-agent communication. Each feature can be restored as a plugin or core feature when needed.
