# Background Jobs & Scheduling

## Mindmap

```
Background Jobs
├── Job Types
│   ├── One-shot
│   │   ├── Run once at specific time
│   │   ├── Run once after delay
│   │   └── Delete after completion (optional)
│   │
│   ├── Recurring
│   │   ├── Cron expression scheduling
│   │   ├── Interval-based (every N minutes)
│   │   ├── Timezone-aware
│   │   └── Enable/disable without deleting
│   │
│   └── Event-driven
│       ├── Triggered by system events
│       ├── Triggered by agent actions
│       ├── Triggered by external webhooks
│       └── Triggered by file changes (watch)
│
├── Job Engine
│   ├── In-process scheduler
│   │   ├── setInterval for intervals
│   │   ├── setTimeout for delays
│   │   ├── Cron parser for schedules
│   │   └── Persistent job queue (SQLite)
│   │
│   ├── Job lifecycle
│   │   ├── pending → running → completed
│   │   ├── pending → running → failed → retry
│   │   ├── Max retry count (configurable)
│   │   └── Dead job handling
│   │
│   └── Worker pool
│       ├── Configurable concurrency
│       ├── Per-agent job limits
│       ├── Priority queue
│       └── Graceful drain on shutdown
│
├── Agent Jobs
│   ├── Scheduled conversations
│   │   ├── "Check my email every 30 min"
│   │   ├── "Morning brief at 7AM"
│   │   └── "Weekly summary on Fridays"
│   │
│   ├── Background tasks
│   │   ├── File processing
│   │   ├── Data scraping
│   │   ├── Report generation
│   │   └── Model fine-tuning (future)
│   │
│   └── Autonomous loops
│       ├── Monitor → Analyze → Act → Report
│       ├── Self-improvement cycles
│       └── Learning from feedback
│
├── Use Cases from awesome-openclaw-usecases
│   ├── Daily Reddit/YouTube digest (recurring)
│   ├── Morning brief (scheduled)
│   ├── Earnings tracker (event-driven)
│   ├── Health check-ins (recurring)
│   ├── Inbox de-clutter (scheduled)
│   └── Night sprints (scheduled)
│
└── API
    ├── POST   /api/jobs — create job
    ├── GET    /api/jobs — list jobs
    ├── GET    /api/jobs/:id — job details
    ├── PATCH  /api/jobs/:id — update job
    ├── DELETE /api/jobs/:id — delete job
    ├── POST   /api/jobs/:id/run — trigger now
    ├── GET    /api/jobs/:id/history — run history
    └── POST   /api/jobs/:id/pause — pause job
```
