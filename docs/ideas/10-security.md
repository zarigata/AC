# Security & Permissions

## Mindmap

```
Security
├── Authentication
│   ├── Local auth
│   │   ├── Password login (bcrypt)
│   │   ├── API key generation
│   │   └── Session tokens (JWT)
│   │
│   ├── Channel auth
│   │   ├── Telegram: bot token
│   │   ├── Discord: bot token
│   │   ├── WhatsApp: QR code
│   │   └── Email: OAuth2
│   │
│   └── Trusted networks
│       ├── LAN mode (no auth needed)
│       ├── Whitelist IPs
│       └── mDNS discovery
│
├── Authorization
│   ├── Role-based
│   │   ├── Admin (full control)
│   │   ├── Operator (manage agents, no system config)
│   │   ├── User (chat only)
│   │   └── Guest (read-only dashboard)
│   │
│   ├── Agent permissions
│   │   ├── Which tools agent can use
│   │   ├── Which channels agent can access
│   │   ├── Which providers agent can use
│   │   ├── Max token budget
│   │   └── Allowed file paths
│   │
│   └── API key scopes
│       ├── read:agents
│       ├── write:agents
│       ├── read:sessions
│       ├── execute:agent
│       └── admin:system
│
├── Data Protection
│   ├── Encryption at rest
│   │   ├── SQLite encryption (SQLCipher)
│   │   ├── Config file encryption
│   │   └── Key derivation from password
│   │
│   ├── Secrets management
│   │   ├── API keys in encrypted store
│   │   ├── Never in config files
│   │   ├── Environment variable support
│   │   └── .env file (gitignored)
│   │
│   └── Input sanitization
│       ├── SQL injection prevention (parameterized queries)
│       ├── XSS prevention (output encoding)
│       ├── Path traversal prevention
│       └── Command injection prevention
│
├── Network Security
│   ├── CORS (configurable origins)
│   ├── Rate limiting (per IP, per endpoint)
│   ├── Request size limits
│   ├── HTTPS support (TLS certs)
│   └── WebSocket security (origin check)
│
└── Audit Trail
    ├── Who did what, when
    ├── Config changes logged
    ├── Agent modifications logged
    ├── Authentication events
    └── Tamper-proof (append-only log)
```
