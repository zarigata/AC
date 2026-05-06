# Agent-to-Agent Communication

## Mindmap

```
Agent Communication
├── Communication Models
│   ├── Direct Message
│   │   ├── Agent A sends message to Agent B
│   │   ├── Synchronous (wait for reply)
│   │   ├── Asynchronous (fire and forget)
│   │   └── Message queue for offline agents
│   │
│   ├── Observe (read-only)
│   │   ├── Agent A subscribes to Agent B's activity
│   │   ├── Receives status updates, logs
│   │   ├── No ability to interfere
│   │   └── Configurable event filters
│   │
│   ├── Delegate (task handoff)
│   │   ├── Agent A assigns task to Agent B
│   │   ├── Includes context and expectations
│   │   ├── Agent B reports back on completion
│   │   └── Timeout handling
│   │
│   └── Broadcast
│       ├── One agent → all agents
│       ├── System announcements
│       ├── Emergency alerts
│       └── Opt-in per agent
│
├── Link System (existing)
│   ├── Link = permission to communicate
│   ├── Types: observe, message, delegate, control
│   ├── No link = isolated (default)
│   ├── Self-links rejected
│   └── Circular link detection
│
├── Message Format
│   └── {
│         id: UUID,
│         from: agentId,
│         to: agentId,
│         type: "message" | "delegate" | "observe_request",
│         content: string,
│         metadata: { task, priority, context },
│         timestamp: ISO,
│         status: "sent" | "delivered" | "read" | "replied"
│       }
│
├── Execution Patterns
│   ├── Pipeline: A → B → C (sequential)
│   ├── Fan-out: A → [B, C, D] (parallel)
│   ├── Fan-in: [A, B] → C (aggregate)
│   ├── Round-robin: A → B → C → A (cycle)
│   └── On-demand: any agent can request any linked agent
│
└── Safety
    ├── Permission checks on every message
    ├── Rate limiting between agents
    ├── Message size limits
    ├── Dead letter queue (undeliverable messages)
    └── Admin can inspect all agent communications
```
