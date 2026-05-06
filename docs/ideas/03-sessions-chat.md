# Session & Chat System

## Mindmap

```
Session System
├── Session
│   ├── id (UUID)
│   ├── agent_id (FK)
│   ├── title (auto-generated from first message)
│   ├── model (which provider/model was used)
│   ├── created_at
│   ├── updated_at
│   ├── message_count
│   └── total_tokens
│
├── Message
│   ├── id (UUID)
│   ├── session_id (FK)
│   ├── role (system | user | assistant | tool)
│   ├── content (text)
│   ├── tokens_in (number)
│   ├── tokens_out (number)
│   ├── duration_ms (response time)
│   ├── model_used (actual model that responded)
│   └── created_at
│
├── Conversation Features
│   ├── Context window management
│   │   ├── Auto-truncate old messages
│   │   ├── Summarize long contexts
│   │   └── Configurable max context size
│   │
│   ├── Message editing
│   │   ├── Edit user messages → regenerate
│   │   └── Branch conversations (fork from message)
│   │
│   ├── Export
│   │   ├── Markdown
│   │   ├── JSON
│   │   └── CSV
│   │
│   └── Search
│       ├── Full-text search across sessions
│       └── Filter by agent, date, model
│
└── API Endpoints
    ├── GET    /api/agents/:id/sessions
    ├── POST   /api/agents/:id/sessions
    ├── GET    /api/agents/:id/sessions/:sid
    ├── DELETE /api/agents/:id/sessions/:sid
    ├── GET    /api/agents/:id/sessions/:sid/messages
    ├── POST   /api/agents/:id/sessions/:sid/messages
    ├── PUT    /api/agents/:id/sessions/:sid/messages/:mid
    └── GET    /api/agents/:id/usage
```

## Context Window Strategy

When conversation exceeds model's context limit:
1. Keep system prompt always
2. Keep last N messages (configurable, default 20)
3. Summarize middle messages into a single "summary" message
4. Track token count per message for accurate budgeting
