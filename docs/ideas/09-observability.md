# Observability & Monitoring

## Mindmap

```
Observability
├── Logs
│   ├── Request logs
│   │   ├── Method, path, status, duration
│   │   ├── Agent ID, session ID
│   │   ├── Provider, model used
│   │   ├── Tokens consumed
│   │   └── IP, user agent
│   │
│   ├── Agent execution logs
│   │   ├── Start/end timestamps
│   │   ├── Input/output token counts
│   │   ├── Error details
│   │   └── Tool calls made
│   │
│   └── System logs
│       ├── Server start/stop
│       ├── Config changes
│       ├── Provider health events
│       └── Cron job results
│
├── Metrics
│   ├── Counters
│   │   ├── Total requests
│   │   ├── Total messages sent
│   │   ├── Total tokens consumed
│   │   ├── Total errors
│   │   └── Active sessions
│   │
│   ├── Gauges
│   │   ├── Current token usage
│   │   ├── Active agents
│   │   ├── Queue depth
│   │   └── Memory usage
│   │
│   └── Histograms
│       ├── Request latency
│       ├── Response time
│       ├── Token per message
│       └── Provider response time
│
├── Dashboard (Web UI)
│   ├── Overview
│   │   ├── System health (green/yellow/red)
│   │   ├── Active agents count
│   │   ├── Token usage today
│   │   └── Recent errors
│   │
│   ├── Per-Agent View
│   │   ├── Session count
│   │   ├── Token usage chart
│   │   ├── Most common use cases
│   │   ├── Error rate
│   │   └── Recent activity feed
│   │
│   ├── Per-Provider View
│   │   ├── Health status
│   │   ├── Latency graph
│   │   ├── Error rate
│   │   ├── Token breakdown
│   │   └── Cost tracking
│   │
│   └── Audit Log
│       ├── All config changes
│       ├── Agent create/delete/modify
│       ├── Permission changes
│       └── Exportable
│
├── Alerts
│   ├── Token budget exceeded
│   ├── Provider down
│   ├── High error rate (>5%)
│   ├── Unusual latency
│   └── Disk space low
│
└── Export
    ├── JSON logs
    ├── CSV metrics
    ├── Prometheus format (future)
    └── Scheduled reports (daily/weekly email)
```
