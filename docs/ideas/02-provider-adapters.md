# Provider Adapter System

## Mindmap

```
Provider Adapter
├── Interface (common)
│   ├── chat(messages, config) → response
│   ├── stream(messages, config) → async iterator
│   ├── models() → Model[]
│   ├── testConnection() → boolean
│   └── estimateTokens(text) → number
│
├── Adapters
│   ├── Ollama (local)
│   │   ├── REST API at localhost:11434
│   │   ├── Model list from /api/tags
│   │   ├── Streaming via /api/chat
│   │   └── Auto-detect running models
│   │
│   ├── Ollama Cloud
│   │   ├── Same API, remote endpoint
│   │   ├── Auth via API key
│   │   └── Model marketplace integration
│   │
│   ├── Z.AI
│   │   ├── Custom endpoint
│   │   ├── GLM models
│   │   └── Thinking/reasoning support
│   │
│   ├── Anthropic
│   │   ├── Claude models
│   │   ├── System prompt handling
│   │   ├── Token counting
│   │   └── Vision support
│   │
│   ├── OpenAI
│   │   ├── GPT-4o, GPT-4, GPT-3.5
│   │   ├── Function calling
│   │   ├── Streaming
│   │   └── Embeddings
│   │
│   └── 45 more (from 50-provider catalog)
│
├── Fallback Chain
│   ├── Primary → Secondary → Tertiary
│   ├── Configurable per agent
│   ├── Auto-switch on error/timeout
│   └── Token budget awareness
│
└── Health Monitor
    ├── Ping interval (configurable)
    ├── Latency tracking
    ├── Error rate counting
    └── Auto-disable threshold
```

## Implementation Notes

- Each adapter is a separate file in `adapters/` directory
- Common interface: `createAdapter(config) → { chat, stream, models, test }`
- Config stored in SQLite: `{ provider, model, apiKey, endpoint, params }`
- Fallback chains defined per-agent or globally
- Health checks run every 60s, results cached
- Token estimation uses tiktoken-like approach (or provider's own count)
