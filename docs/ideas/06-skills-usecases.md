# Skill Store & Use Case Templates

## Skill Store

```
Skill Store
├── Publishing
│   ├── Skill manifest (skill.json)
│   │   ├── name, version, author
│   │   ├── description, tags
│   │   ├── permissions needed
│   │   ├── compatible presets
│   │   └── dependencies
│   │
│   ├── Publish flow
│   │   ├── Author → submit skill package
│   │   ├── Auto-validation (lint, security scan)
│   │   ├── Manual review (optional)
│   │   └── Published to registry
│   │
│   └── Versioning
│       ├── Semver (major.minor.patch)
│       ├── Changelog required
│       ├── Rollback support
│       └── Deprecation notices
│
├── Discovery
│   ├── Search by name, tag, use case
│   ├── Sort by popularity, rating, newest
│   ├── Category browsing
│   ├── Screenshots/demos
│   └── Compatibility checker
│
├── Installation
│   ├── One-click install
│   ├── Permission review before install
│   ├── Dependency resolution
│   ├── Bulk install (preset bundles)
│   └── Update all / auto-update
│
└── Community
    ├── Ratings (1-5 stars)
    ├── Reviews
    ├── Download counts
    ├── Author profiles
    └── Flag/report system
```

## Use Case Templates (from awesome-openclaw-usecases)

Each template is a pre-configured skill bundle + agent setup:

```
Use Case Templates (42+)
├── 📰 Content & Media
│   ├── daily-reddit-digest — Curated subreddit summaries
│   ├── daily-youtube-digest — New video summaries from followed channels
│   ├── x-account-analysis — Qualitative X/Twitter profile analysis
│   ├── multi-source-tech-news — 109+ source news aggregation
│   ├── x-twitter-automation — Post, reply, like, DM, search
│   ├── youtube-content-pipeline — Video scouting → research → tracking
│   ├── content-factory — Multi-agent content pipeline (Discord)
│   ├── podcast-production — Full podcast workflow
│   └── ai-video-editing — Natural language video editing
│
├── 🚀 Productivity & Automation
│   ├── autonomous-tasks — Goal-driven daily task generation
│   ├── self-healing-server — Infrastructure agent with SSH
│   ├── autonomous-project-mgmt — STATE.yaml multi-agent coordination
│   ├── multi-channel-customer-service — WhatsApp/IG/Email/Reviews
│   ├── phone-assistant — Voice call + SMS access
│   ├── inbox-declutter — Newsletter summarization
│   ├── personal-crm — Auto-discover contacts, track relationships
│   ├── family-calendar — Multi-calendar aggregation + morning brief
│   ├── custom-morning-brief — Fully customized daily briefing
│   ├── meeting-notes — Transcripts → summaries → action items
│   ├── habit-tracker — Daily check-ins, streaks, adaptive tone
│   ├── second-brain — Text anything → search later (RAG)
│   ├── todoist-sync — Reasoning logs → task manager
│   └── event-guest-confirmation — Automated phone calls to guests
│
├── 🔬 Research & Finance
│   ├── earnings-tracker — Tech/AI earnings previews & alerts
│   ├── knowledge-base-rag — URL/tweet/article → searchable KB
│   ├── market-research — Mine Reddit/X for pain points → build MVPs
│   ├── idea-validator — Scan GitHub/HN/npm/PH before building
│   ├── semantic-memory — Vector search over markdown memory
│   ├── arxiv-reader — Conversational paper reading
│   ├── latex-writing — Write & compile LaTeX, instant PDF
│   ├── hf-papers — Trending ML papers on HuggingFace
│   └── polymarket-autopilot — Paper trading with backtesting
│
├── 🛠️ Development
│   ├── game-dev-pipeline — Full lifecycle game dev management
│   ├── n8n-orchestration — Delegate API calls to n8n workflows
│   ├── dynamic-dashboard — Real-time data from APIs/DBs/social
│   └── multi-agent-team — Specialized agents (strategy/dev/marketing)
│
└── 📞 Communication
    ├── multi-channel-assistant — Route across Telegram/Slack/email/calendar
    └── phone-notifications — Turn alerts into actual phone calls
```
