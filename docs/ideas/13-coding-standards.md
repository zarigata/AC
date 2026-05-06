# Coding Standards Integration (vibe-rules)

## Concept

Auto-detect the user's project type and apply relevant coding standards from the vibe-rules-collection. This gives Zsiistant an edge — it doesn't just write code, it writes *good* code according to established best practices.

## Mindmap

```
Coding Standards
├── Detection
│   ├── Scan project files for indicators
│   │   ├── package.json → TypeScript/JavaScript
│   │   ├── requirements.txt / pyproject.toml → Python
│   │   ├── go.mod → Go
│   │   ├── Cargo.toml → Rust
│   │   ├── CMakeLists.txt / Makefile → C/C++
│   │   ├── Gemfile → Ruby
│   │   └── composer.json → PHP
│   │
│   ├── Framework detection
│   │   ├── Express / Fastify / Koa → Node.js
│   │   ├── Django / Flask / FastAPI → Python
│   │   ├── React / Vue / Svelte → Frontend
│   │   ├── Rails → Ruby
│   │   └── Laravel → PHP
│   │
│   └── Auto-apply rules
│       ├── On first project open
│       ├── On file creation
│       └── Manual trigger
│
├── Available Rule Sets
│   ├── Language Rules
│   │   ├── pythonic.windsurfrules — Python best practices
│   │   ├── typescript_modular.windsurfrules — TypeScript patterns
│   │   ├── golang_best_practices.windsurfrules — Go idioms
│   │   ├── rust_clean_architecture.windsurfrules — Rust architecture
│   │   ├── cpp_modern_best_practices.windsurfrules — Modern C++
│   │   ├── ruby_idiomatic_best_practices.windsurfrules — Ruby style
│   │   └── php_modern_best_practices.windsurfrules — PHP patterns
│   │
│   ├── API Design
│   │   ├── rest_api_design.windsurfrules — REST conventions
│   │   └── graphql_api_design.windsurfrules — GraphQL patterns
│   │
│   ├── Architecture
│   │   ├── Clean Architecture
│   │   ├── Hexagonal Architecture
│   │   ├── Microservices
│   │   ├── MVC
│   │   └── SOA
│   │
│   ├── Database
│   │   ├── generic_sql_best_practices.windsurfrules
│   │   └── MySQL / PostgreSQL / SQLite specific
│   │
│   ├── DevOps
│   │   ├── dockerfile_best_practices.windsurfrules
│   │   ├── kubernetes_manifests.windsurfrules
│   │   └── terraform_best_practices.windsurfrules
│   │
│   ├── Security
│   │   ├── OWASP Top 10 rules
│   │   ├── Secrets management
│   │   └── Input validation
│   │
│   └── Testing
│       ├── mutation_testing_principles
│       ├── property_based_testing (hypothesis)
│       ├── contract_testing (pact)
│       ├── performance_testing
│       ├── chaos_engineering
│       └── accessibility_testing
│
├── Integration
│   ├── System prompt injection
│   │   ├── Detected rules → appended to agent system prompt
│   │   ├── Agent follows rules when generating code
│   │   └── Rules update when project changes
│   │
│   ├── File watchers
│   │   ├── New .py file → Python rules active
│   │   ├── New .rs file → Rust rules active
│   │   └── Mixed projects → all relevant rules
│   │
│   └── Preset integration
│       ├── Dev Companion preset → all coding rules
│       ├── Other presets → rules for detected languages only
│       └── Custom rule selection in settings
│
└── UI
    ├── Settings → Coding Standards
    ├── Show active rules per project
    ├── Enable/disable individual rules
    ├── Import custom .windsurfrules files
    └── Rule effectiveness feedback
```
