# Preset System

## Concept

Presets are pre-configured agent setups that users can select during first-run or switch to later. Each preset defines: which features are enabled, what the default personality is, which channels connect, and which use cases are pre-loaded.

## Mindmap

```
Presets
├── Selection Flow
│   ├── First Run Wizard
│   │   ├── "What do you want to do?"
│   │   ├── Show preset cards with icons
│   │   ├── User picks one (or starts unfiltered)
│   │   ├── Optional customization
│   │   └── Generate agent config from template
│   │
│   └── Switch Later
│       ├── Settings → Presets → Change
│       ├── Migrates existing data
│       └── Can combine multiple presets
│
├── Preset Templates
│   ├── 🏠 Home Assistant
│   │   ├── Calendar aggregation
│   │   ├── Reminders & alarms
│   │   ├── Morning/evening briefings
│   │   ├── Household inventory
│   │   ├── Shopping lists
│   │   └── Weather & news
│   │
│   ├── 💼 Productivity Pro
│   │   ├── Task management (todo, projects)
│   │   ├── Email triage & summarization
│   │   ├── Meeting notes → action items
│   │   ├── Calendar scheduling
│   │   ├── CRM (contacts, follow-ups)
│   │   └── Habit tracking
│   │
│   ├── 📰 Content Creator
│   │   ├── Social media posting (X, Instagram)
│   │   ├── YouTube pipeline (ideas → script → edit)
│   │   ├── Newsletter drafting
│   │   ├── Podcast prep & show notes
│   │   ├── Content calendar
│   │   └── Analytics tracking
│   │
│   ├── 🔬 Research Lab
│   │   ├── Paper reading (arXiv, HuggingFace)
│   │   ├── Knowledge base / RAG
│   │   ├── LaTeX paper writing
│   │   ├── Citation management
│   │   ├── Literature review automation
│   │   └── Note-taking & linking
│   │
│   ├── 💰 Market Watch
│   │   ├── Earnings reports
│   │   ├── Stock/crypto alerts
│   │   ├── News aggregation
│   │   ├── Prediction markets
│   │   ├── Portfolio tracking
│   │   └── Financial summaries
│   │
│   ├── 🛠️ Dev Companion
│   │   ├── Code review
│   │   ├── CI/CD monitoring
│   │   ├── Git workflow assistance
│   │   ├── Issue triage
│   │   ├── Documentation generation
│   │   └── Stack Overflow search
│   │
│   ├── 🤖 Multi-Agent Team
│   │   ├── Strategy agent (planning)
│   │   ├── Dev agent (coding)
│   │   ├── Marketing agent (content)
│   │   ├── QA agent (testing)
│   │   ├── Agent-to-agent messaging
│   │   └── Shared task board
│   │
│   ├── 📞 Communication Hub
│   │   ├── Multi-channel routing
│   │   ├── Customer service (WhatsApp, IG, Email)
│   │   ├── Phone/SMS integration
│   │   ├── Email management
│   │   ├── Auto-responses
│   │   └── Contact forms
│   │
│   └── 🔓 Unfiltered
│       ├── Everything enabled
│       ├── No guardrails
│       ├── Full model access
│       ├── Custom everything
│       └── Power user mode
│
├── Preset Config Structure
│   └── {
│         id: "home-assistant",
│         name: "Home Assistant",
│         icon: "🏠",
│         description: "...",
│         features: ["calendar", "reminders", "briefings"],
│         defaultModel: "ollama/llama3",
│         maxTokens: 4096,
│         channels: ["telegram", "web"],
│         personality: "friendly, organized",
│         skills: ["calendar", "weather", "news"],
│         useCases: ["morning-brief", "reminders", "shopping"]
│       }
│
└── Custom Presets
    ├── User can create own from scratch
    ├── Clone existing + modify
    ├── Share presets (export/import JSON)
    └── Community preset store
```
