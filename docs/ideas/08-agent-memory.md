# Agent Memory & Persistence

## Mindmap

```
Agent Memory
├── Memory Types
│   ├── Short-term (per session)
│   │   ├── Conversation context
│   │   ├── Current task state
│   │   ├── Rolling window (last N messages)
│   │   └── Cleared on session end
│   │
│   ├── Long-term (persistent)
│   │   ├── User preferences
│   │   ├── Learned facts about user
│   │   ├── Recurring patterns
│   │   ├── Important decisions
│   │   └── Survives restarts
│   │
│   ├── Episodic (events)
│   │   ├── Timestamped records
│   │   ├── "What happened when"
│   │   ├── Searchable by date
│   │   └── Auto-summarized after N events
│   │
│   └── Semantic (RAG)
│       ├── Vector embeddings of knowledge
│       ├── Similarity search
│       ├── Auto-indexed from conversations
│       └── External document ingestion
│
├── Storage
│   ├── SQLite tables
│   │   ├── memories (id, agent_id, type, content, tags, importance, created_at)
│   │   ├── memory_links (memory_id, related_memory_id, relation_type)
│   │   └── memory_search (FTS5 virtual table)
│   │
│   ├── File-based
│   │   ├── /agents/{id}/memory/
│   │   ├── Markdown files (human-readable)
│   │   ├── Auto-organized by date/type
│   │   └── Git-trackable
│   │
│   └── Vector store
│       ├── Built-in (SQLite + vec extension)
│       ├── Or external (ChromaDB, Qdrant)
│       ├── Embedding model (local or API)
│       └── Index management
│
├── Memory Operations
│   ├── Remember(content, tags, importance)
│   ├── Recall(query, limit, filters)
│   ├── Forget(memory_id)
│   ├── Consolidate() — merge similar memories
│   ├── Prune() — remove low-importance old memories
│   └── Export(format) — JSON, markdown, CSV
│
└── Auto-Memory
    ├── Agent automatically saves important info
    ├── "Remember this" → explicit save
    ├── Periodic consolidation (summarize old → compressed)
    ├── Importance scoring (0-1, based on mentions)
    └── Decay: unused memories fade over time
```
