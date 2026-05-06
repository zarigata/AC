# Token Discipline & Budgeting

## Philosophy

"Better outcomes per token" — not "more tokens everywhere."

## Mindmap

```
Token Discipline
├── Budget System
│   ├── Per-agent budgets
│   │   ├── Daily limit (input + output)
│   │   ├── Monthly limit
│   │   ├── Per-session limit
│   │   └── Hard cap vs soft warning
│   │
│   ├── Global budgets
│   │   ├── Total daily spend
│   │   ├── Per-provider limits
│   │   └── Auto-pause when exceeded
│   │
│   └── Budget alerts
│       ├── 50% warning
│       ├── 80% warning
│       ├── 95% critical
│       └── 100% hard stop
│
├── Smart Routing
│   ├── Task Classification
│   │   ├── Simple (classification, routing) → small model
│   │   ├── Medium (summarization, formatting) → medium model
│   │   ├── Complex (reasoning, code) → large model
│   │   └── Creative (writing, brainstorming) → medium-large
│   │
│   ├── Fallback Chains
│   │   ├── Primary: gpt-4o → Claude 3.5 → llama3.1:70b
│   │   ├── Configurable per agent
│   │   ├── Auto-switch on error/timeout
│   │   └── Cost-aware routing
│   │
│   └── Caching
│       ├── Response caching (same input → cached output)
│       ├── Embedding caching
│       ├── Context caching (provider-level)
│       └── TTL-based expiration
│
├── Token Tracking
│   ├── Per-message counting
│   │   ├── Input tokens
│   │   ├── Output tokens
│   │   ├── Total per message
│   │   └── Cost estimation ($ per 1K tokens)
│   │
│   ├── Per-agent metrics
│   │   ├── Tokens used today/week/month
│   │   ├── Average tokens per interaction
│   │   ├── Most expensive sessions
│   │   └── Token efficiency score
│   │
│   └── Dashboard
│       ├── Real-time token usage
│       ├── Cost breakdown by provider
│       ├── Agent comparison chart
│       ├── Trend over time
│       └── Export reports
│
└── Prompt Optimization
    ├── Minimize system prompt size
    ├── Truncate old context intelligently
    ├── Avoid redundant information
    ├── Use structured formats (JSON > prose)
    └── Compress tool descriptions
```
