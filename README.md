# Maple & Spruce

Digital platform for Maple & Spruce - a folk arts collective offering handmade goods, workshops, and music lessons in Morgantown, WV.

**Current Phase**: Phase 1 - Etsy integration & artist payout tracking (no physical store yet)

## Quick Start

```bash
# Install dependencies
npm install

# Run the development server
npx nx dev maple-spruce

# Open http://localhost:3000
```

## Project Structure

```
maple-and-spruce/
├── .claude/                        # Claude Code configuration
│   ├── CLAUDE.md                  # Agent instructions (imports AGENTS.md)
│   └── AGENTS.md                  # Detailed agent rules & project context
├── apps/
│   ├── maple-spruce/              # Main Next.js application
│   ├── functions/                 # Firebase Cloud Functions entry point
│   └── maple-spruce-e2e/          # Playwright e2e tests
├── libs/
│   ├── firebase/
│   │   ├── database/              # Firestore repositories
│   │   ├── functions/             # Cloud Function builder utilities
│   │   └── maple-functions/       # Individual function implementations
│   └── ts/
│       ├── domain/                # Domain models & types
│       ├── firebase/              # Firebase client config
│       └── validation/            # Vest validation suites
└── docs/                           # Documentation
    ├── REQUIREMENTS.md            # Business requirements & features
    ├── PATTERNS-AND-PRACTICES.md  # Development patterns guide
    ├── DECISIONS.md               # Architecture decision records
    └── BACKLOG.md                 # Ideas & future features
```

## Documentation

| Document | Purpose |
|----------|---------|
| [Requirements](docs/REQUIREMENTS.md) | What we're building and why |
| [Patterns & Practices](docs/PATTERNS-AND-PRACTICES.md) | Code patterns & architecture |
| [Decisions](docs/DECISIONS.md) | Architecture Decision Records (ADRs) |
| [Backlog](docs/BACKLOG.md) | Ideas and future features |
| [Agent Rules](.claude/AGENTS.md) | Git workflow & coding standards |

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Framework | Next.js + React | 15.5.9 / 19.0.0 |
| Monorepo | Nx | 22.3.3 |
| UI | MUI (Material Design) | 6.x |
| Database | Firebase Firestore | - |
| Auth | Firebase Authentication | - |
| Backend | Firebase Cloud Functions | v2 (Gen 2) |
| Payments | Stripe | (planned) |
| Testing | Vitest + Playwright | 4.x / 1.x |

## Brand Colors

| Name | Hex | Usage |
|------|-----|-------|
| Cream | `#D5D6C8` | Backgrounds |
| Dark Brown | `#4A3728` | Headings, primary text |
| Sage Green | `#6B7B5E` | Buttons, accents |
| Warm Gray | `#7A7A6E` | Body text |

## Git Workflow

```bash
# Always work on feature branches
git checkout -b feature/7-firebase-setup

# Commit with clear messages referencing issues
git commit -m "feat: add artist management (#2)"

# Create PRs for review
gh pr create --title "feat: Firebase setup (#7)"
```

See [AGENTS.md](.claude/AGENTS.md) for detailed workflow rules.

## Common Commands

```bash
# Development
npx nx dev maple-spruce            # Start dev server
npx nx build maple-spruce          # Production build
npx nx run maple-spruce:typecheck  # TypeScript check

# Functions
npx nx build functions             # Build Cloud Functions
firebase emulators:start           # Run Firebase emulators

# E2E Testing
npx nx e2e maple-spruce-e2e        # Run Playwright tests

# Utilities
npx nx graph                        # View dependency graph
npx nx affected -t build           # Build affected projects
```

## Environment Setup

Firebase configuration is embedded in the codebase (API keys are public by design - security is enforced via Firestore rules and Cloud Function auth).

For Cloud Functions deployment, environment files are in the repo root:
- `.env.dev` - Development CORS origins
- `.env.prod` - Production CORS origins

No `.env.local` files are required for local development.

## Deployed Functions

Cloud Functions are deployed to `us-east4` (Northern Virginia) via GitHub Actions on merge to main.

| Function | Type | Purpose |
|----------|------|---------|
| getArtists | authenticated | List all artists |
| getArtistById | authenticated | Get single artist |
| createArtist | admin | Create new artist |
| updateArtist | admin | Update artist |
| deleteArtist | admin | Delete artist |
| getProducts | authenticated | List all products |
| getProductById | authenticated | Get single product |
| createProduct | admin | Create new product |
| updateProduct | admin | Update product |
| deleteProduct | admin | Delete product |
| uploadArtistImage | admin | Upload artist photo |
| healthCheck | public | Health check endpoint |

## GitHub Issues

Track progress via GitHub Issues:
- [Phase 1 Epic: Etsy + Artist Payouts](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/1)
- [All Issues](https://github.com/Maple-and-Spruce/maple-and-spruce/issues)

## CI/CD

- **PR Checks**: Security audit, TypeScript check, build verification
- **Deploy**: Functions auto-deploy on merge to main via Workload Identity Federation (keyless)

---

*Built with Claude Code*
