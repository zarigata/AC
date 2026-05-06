<div align="center">

# 🧪 ZSIISTANT

### Factory-Made AI Agent Platform

```
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   ╔═╗╔╦╗╔═╗╦═╗╦╔═  ╦╔═╔═╗╦ ╦╔═╗╦═╗╦╔═               ║
║   ╠╣  ║ ║ ║╠╦╝╠╩╗  ╠╩╗║╣ ║║║║╣ ╠╦╝╠╩╗               ║
║   ╚   ╩ ╚═╝╩╚═╩ ╩  ╩ ╩╚═╝╚╩╝╚═╝╩╚═╩ ╩               ║
║                                                          ║
║          Factory-Made · OpenClaw Clone · Webcore         ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
```

**Plug-and-play AI agents for power users and non-tech users alike.**

`Unfiltered Mode` for full control · `Preset Mode` for guided pathways

[![Tests](https://img.shields.io/badge/tests-19%2F19-brightgreen?style=flat-square&labelColor=0a0a2e)](https://github.com/zarigata/AC)
[![Zero Deps](https://img.shields.io/badge/deps-0-blue?style=flat-square&labelColor=0a0a2e)](https://github.com/zarigata/AC)
[![License](https://img.shields.io/badge/license-MIT-yellow?style=flat-square&labelColor=0a0a2e)](LICENSE)
[![Webcore](https://img.shields.io/badge/aesthetic-webcore-ff00ff?style=flat-square&labelColor=0a0a2e)](https://aesthetics.fandom.com/wiki/Webcore)

🚧 **UNDER CONSTRUCTION** — Active development · v0.2.0-alpha

</div>

---

## ⚡ Quick Start

```bash
git clone https://github.com/zarigata/AC.git zsiistant
cd zsiistant
npm install
npm start
# → http://localhost:4000
```

That's it. No PostgreSQL. No Redis. No Docker. Just Node.js 26+.

---

## 🧪 What is Zsiistant?

Zsiistant is a **factory-made OpenClaw/PicoClaw clone** designed for:

- **Power users** who want full control over 100 agents, 50 providers, and multi-channel connectivity
- **Non-tech users** who pick a preset and get a working AI assistant in 60 seconds
- **Developers** who want a clean, extensible, zero-dependency platform to build on

### Two Modes

| Mode | Description |
|------|-------------|
| 🔓 **Unfiltered** | Full control. All settings exposed. No guardrails. Power user paradise. |
| 🎯 **Preset Mode** | Pick a use case → get a pre-configured agent. 9 built-in presets, 42+ use case templates. |

---

## 🎯 Presets

| | Preset | Use Case |
|---|--------|----------|
| 🏠 | Home Assistant | Calendar, reminders, morning briefs, shopping lists, weather |
| 💼 | Productivity Pro | Tasks, email triage, meeting notes, CRM, habit tracking |
| 📰 | Content Creator | Social media, YouTube pipeline, newsletters, podcasts |
| 🔬 | Research Lab | arXiv reader, knowledge base, LaTeX writing, citations |
| 💰 | Market Watch | Earnings, stock/crypto alerts, news aggregation |
| 🛠️ | Dev Companion | Code review, CI/CD, git workflow, docs generation |
| 🤖 | Multi-Agent Team | Strategy + Dev + Marketing + QA agents coordinating |
| 📞 | Comm Hub | Multi-channel routing, customer service, phone/SMS |
| 🔓 | Unfiltered | Everything enabled, no restrictions, full power |

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────┐
│              Zsiistant v0.2.0              │
├────────────────────────────────────────────┤
│  Web UI (vanilla)  │  API (node:http)      │
│  Webcore theme     │  REST + WebSocket     │
├────────────────────┴───────────────────────┤
│  Agent Registry │ Sessions │ Messages      │
├────────────────────────────────────────────┤
│  SQLite (node:sqlite) │ Provider Adapters  │
├────────────────────────────────────────────┤
│  Channels: Telegram · Discord · Signal · … │
└────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Runtime | Node.js 26+ | `--experimental-sqlite` built-in |
| Database | SQLite | Zero config, single file, portable |
| API | Raw `node:http` | No Express overhead |
| Frontend | Vanilla HTML/CSS/JS | No build step, fast load |
| Styling | Webcore design system | Early web nostalgia 🌐 |
| Dependencies | **0** | No external npm packages |

---

## 🔌 API Endpoints

### Agents
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/agents` | List all agents |
| `GET` | `/api/agents/:id` | Get single agent |
| `POST` | `/api/agents` | Create agent |
| `PATCH` | `/api/agents/:id` | Update agent |
| `DELETE` | `/api/agents/:id` | Delete agent |
| `GET` | `/api/agents/:id/usage` | Token usage stats |

### Sessions & Messages
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/agents/:id/sessions` | List sessions |
| `POST` | `/api/agents/:id/sessions` | Create session |
| `GET` | `/api/agents/:id/sessions/:sid/messages` | List messages |
| `POST` | `/api/agents/:id/sessions/:sid/messages` | Add message |

### Links & Topology
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/links` | Create link |
| `DELETE` | `/api/links` | Delete link |
| `GET` | `/api/topology` | Full topology graph |

### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/api/providers` | Provider catalog |
| `GET` | `/api/settings` | System settings |

---

## 🧪 Tests

```bash
npm test
```

```
✔ 19/19 tests passing
✔ Agent CRUD (create, read, update, delete)
✔ Sessions & Messages
✔ Token usage tracking
☑ Provider catalog (50 providers)
☑ Link management & topology
☑ Input validation & error handling
```

---

## 📡 Provider Priority

First wave (live now):
1. 🦙 Ollama (local)
2. ☁️ Ollama Cloud
3. 🧠 Z.AI
4. 🤖 Anthropic
5. 💬 OpenAI

Then: Groq, DeepSeek, Gemini, Mistral, and 41 more.

---

## 🌐 Webcore Design

Zsiistant uses the [Webcore aesthetic](https://aesthetics.fandom.com/wiki/Webcore):

- ✨ Pixel fonts & neon glow effects
- 🖥️ Win95-style window frames
- 🌌 Starfield backgrounds with scanlines
- 💫 Glitch animations on headers
- 🚧 Under Construction banners
- 📊 Fake hit counters (obviously)

Because AI agents deserve a UI that slaps.

---

## 🗺️ Roadmap

- [x] Agent CRUD (create, read, update, delete)
- [x] Session & message management
- [x] Token usage tracking
- [x] 50-provider catalog
- [x] Webcore UI
- [x] GitHub Pages
- [ ] Live provider adapters (Ollama → OpenAI)
- [ ] Multi-channel connectivity (Telegram, Discord, Signal)
- [ ] Preset engine & first-run wizard
- [ ] Skill import/install system
- [ ] Agent memory & persistence
- [ ] Background scheduler & workers
- [ ] Observability dashboard
- [ ] Agent-to-agent communication
- [ ] 42+ use case templates
- [ ] Coding standards auto-detection (vibe-rules)

---

## 🤝 Contributing

PRs welcome. Branch strategy:
- `stable` — production-ready code
- `dev` — active development
- `ideas` — architecture docs, mindmaps, RFCs

---

## 📜 License

MIT — use it, fork it, break it, fix it.

---

<div align="center">

**[🏠 Website](https://zarigata.github.io/AC/) · [🐛 Issues](https://github.com/zarigata/AC/issues) · [💬 Discord](https://discord.com/invite/clawd)**

```
Best viewed in Netscape Navigator 4.0+ at 800x600
```

*Visitors: 000042*

</div>
