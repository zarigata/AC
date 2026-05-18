# Zazi ⚔️ Your private AI army, one machine.

```text
   ███████╗ █████╗ ███████╗██╗    
   ╚══███╔╝██╔══██╗╚══███╔╝██║    
     ███╔╝ ███████║  ███╔╝ ██║    
    ███╔╝  ██╔══██║ ███╔╝  ██║    
   ███████╗██║  ██║███████╗███████╗
   ╚══════╝╚═╝  ╚═╝╚══════╝╚══════╝
   Your private AI army, one machine.
```

[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-22+-blue.svg)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](Dockerfile)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)](#)

> **"What if you could run 100 AI agents on a Raspberry Pi and they all talked to each other?"**

---

## 🚀 One-line install

```bash
curl -sSL https://getzazi.dev | bash
```

> No Docker? No worries. We'll clone, install, and even write a systemd service for you.

## 🤔 What is Zazi?

Zazi is a **local-first multi-agent platform** — like running your own private AI company on a single machine.

We organize agents into a **3-level hierarchy**:

- 🧠 **Orchestrators** — the CEOs. They delegate tasks, watch progress, and coordinate.
- ⚙️ **Agents** — the specialists. Coders, writers, researchers, each with a purpose.
- 🔧 **Sub-agents** — the workers. Scrapers, parsers, fetchers. The muscle.

Orchestrators talk to Agents. Agents talk to Sub-agents. Want cross-team communication? Create a **link**. Want isolation? Set an agent to `isolated`. It's your army — you set the rules.

## ⚔️ Why Zazi?

| Feature | Zazi | OpenClaw | PicoClaw |
|---------|------|----------|----------|
| Agents per machine | **100** | ~12 | ~5 |
| Local-first | ✅ | ⚠️ | ✅ |
| Zero dependencies | ✅ | ❌ | ❌ |
| 50 LLM backends | ✅ | ~20 | ~3 |
| Agent hierarchy | ✅ | ❌ | ❌ |
| Peer messaging | ✅ | ❌ | ❌ |
| Skill store (planned) | ✅ | ✅ | ❌ |
| Retro UI | ✅ | ❌ | ❌ |
| Token conservative | ✅ | ~ | ~ |

## ⚡ Quick start

```bash
git clone https://github.com/zarigata/AC.git zazi
cd zazi
npm start
```

Open `http://localhost:4000` — your control room is live.

### Docker route

```bash
docker-compose up -d
```

Done. Port 4000. Volume `zazi-data:/data`. Zero config.

## 🎨 Agent flavors

Every agent gets a personality. Built-in presets include:

| Preset | Role | Vibe |
|--------|------|------|
| 🤖 Orchestrator | Delegates tasks, monitors runs | "I'll handle the strategy." |
| 🔭 Researcher | Collects docs, compares backends | "Let me pull the data." |
| 💻 Coder | Writes code, reviews PRs | "Ship it." |
| ✍️ Writer | Drafts, edits, summarizes | "Words are my weapon." |
| 🎨 Designer | UX, wireframes, pixel perfection | "Make it pop." |

> Screenshot placeholders for the control room UI coming soon!

## 🏗️ Architecture

```text
┌─────────────────────────────────────────────┐
│         Zazi Multi-Agent Platform           │
│  ┌─────────────┐  ┌──────────────────────┐  │
│  │  apps/web   │  │      apps/api        │  │
│  │  Retro UI   │──│  HTTP + Registry     │  │
│  │  Control    │  │  SQLite (built-in)   │  │
│  └─────────────┘  └──────────────────────┘  │
│         │                   │               │
│         └─────────┬─────────┘               │
│                   │                         │
│  ┌────────────────┴────────────────────┐   │
│  │     packages/shared                  │   │
│  │  Validation · Provider Catalog       │   │
│  │  50 Backends · Contracts             │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

## 🗺️ Roadmap

- [x] 100-agent SQLite registry
- [x] 3-level hierarchy (orchestrator → agent → sub-agent)
- [x] Agent links (observe / message / delegate)
- [x] Peer messaging with isolation modes
- [x] 50-provider catalog
- [x] Retro Webcore UI with theme toggle
- [x] Docker + docker-compose + install script
- [ ] Live provider adapters (Ollama, Anthropic, OpenAI, Z.AI)
- [ ] Agent execution engine
- [ ] Internal skill store (publish · install · rate · version)
- [ ] OpenClaw skill compatibility layer
- [ ] Run history, observability, safety controls
- [ ] Multi-machine federation

## 🎮 Contributing

Zazi is an **open garage project**. We welcome PRs, ideas, and terrible puns.

1. Fork it
2. `git checkout dev`
3. Make it awesome
4. `npm test`
5. Open a PR

> Code style: keep it lean, keep it fun, keep it working. No external runtime dependencies.

---

## 📜 License

MIT. Do what you want. Run it on a toaster. Build your AI empire. Just don't blame us when your orchestrator starts acting like a CEO.

```
Built with 💜 and a lot of caffeine.
```
