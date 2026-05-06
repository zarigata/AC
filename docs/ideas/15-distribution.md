# Deployment & Distribution

## Mindmap

```
Distribution
├── Installation
│   ├── One-liner install
│   │   ├── curl -fsSL https://get.zsiistant.dev | bash
│   │   ├── Detects OS (Linux, macOS, Windows WSL)
│   │   ├── Installs Node.js if missing
│   │   ├── Creates user, sets up directories
│   │   └── Starts systemd service
│   │
│   ├── npm global install
│   │   ├── npm i -g zsiistant
│   │   ├── zsiistant init
│   │   └── zsiistant start
│   │
│   ├── Docker
│   │   ├── docker run -p 4000:4000 zarigata/zsiistant
│   │   ├── Docker Compose (with volumes)
│   │   └── Multi-arch (amd64, arm64)
│   │
│   └── Portable binary
│       ├── Single executable (pkg/boxednode)
│       ├── No Node.js required
│       └── Cross-platform builds
│
├── Self-hosting
│   ├── systemd service
│   │   ├── Auto-start on boot
│   │   ├── Auto-restart on crash
│   │   ├── Log rotation
│   │   └── Resource limits
│   │
│   ├── Reverse proxy
│   │   ├── Caddy (auto-HTTPS)
│   │   ├── Nginx
│   │   └── Cloudflare tunnel
│   │
│   └── Backup/Restore
│       ├── SQLite backup (copy DB file)
│       ├── Config backup
│       ├── Scheduled auto-backup
│       └── One-command restore
│
├── Upgrades
│   ├── zsiistant update
│   ├── Auto-update check (weekly)
│   ├── Rollback to previous version
│   ├── Migration scripts for DB changes
│   └── Changelog display
│
├── Hardware Targets
│   ├── Raspberry Pi 4/5 (ARM64)
│   ├── Old laptops (x86_64)
│   ├── VPS (1GB RAM minimum)
│   ├── NAS devices
│   └── Docker containers anywhere
│
└── Distribution Channels
    ├── GitHub Releases
    ├── npm registry
    ├── Docker Hub
    ├── AUR (Arch)
    ├── Homebrew (macOS)
    └── Scoop (Windows)
```
