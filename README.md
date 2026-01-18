# Maple & Spruce

Digital platform for Maple & Spruce - a folk arts collective offering handmade goods, workshops, and music lessons in Morgantown, WV.

**Current Phase**: Phase 1 - Etsy integration & artist payout tracking

**Status**: Production ready - web app and API deployed, CI/CD working

## Live URLs

| Service | URL |
|---------|-----|
| Web App | [mapleandsprucefolkarts.com](https://mapleandsprucefolkarts.com) |
| API | maple-and-spruce-api.web.app |

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
├── apps/
│   ├── maple-spruce/              # Next.js web application
│   ├── functions/                 # Firebase Cloud Functions entry point
│   └── maple-spruce-e2e/          # Playwright e2e tests
├── libs/
│   ├── firebase/
│   │   ├── database/              # Admin SDK + Firestore repositories
│   │   ├── functions/             # Cloud Function builder utilities
│   │   └── maple-functions/       # Individual function implementations
│   └── ts/
│       ├── domain/                # Domain models & types
│       ├── firebase/
│       │   ├── firebase-config/   # Firebase client SDK
│       │   └── api-types/         # API request/response types
│       └── validation/            # Vest validation suites
├── docs/                          # Documentation
└── .claude/                       # Claude Code configuration
```

## Documentation

| Document | Purpose |
|----------|---------|
| [Requirements](docs/REQUIREMENTS.md) | Business requirements, phased roadmap, data models |
| [Patterns & Practices](docs/PATTERNS-AND-PRACTICES.md) | Code patterns & architecture |
| [Decisions](docs/DECISIONS.md) | Architecture Decision Records (ADRs) |
| [Backlog](docs/BACKLOG.md) | Ideas and future features |
| [Agent Rules](.claude/AGENTS.md) | Git workflow, coding standards, implementation status |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 + React 19 |
| Monorepo | Nx |
| UI | MUI (Material Design) |
| Database | Firebase Firestore |
| Auth | Firebase Authentication |
| Backend | Firebase Cloud Functions v2 |
| POS (future) | Square |
| Payments (future) | Stripe |

## Architecture

**Hybrid Square + Firestore architecture** (Phase 2):
- **Square** owns product catalog and inventory quantities
- **Firestore** owns artist profiles, consignment relationships, commissions, payouts

**Current (Phase 1)**:
- Firebase Auth for user management
- Firestore for all data storage
- Cloud Functions for business logic
- Etsy integration for online sales tracking

See [ADR-010](docs/DECISIONS.md#adr-010-hybrid-inventory-architecture-square--firestore) for details.

## Brand Colors

| Name | Hex | Usage |
|------|-----|-------|
| Cream | `#D5D6C8` | Backgrounds |
| Dark Brown | `#4A3728` | Headings, primary text |
| Sage Green | `#6B7B5E` | Buttons, accents |
| Warm Gray | `#7A7A6E` | Body text |

## Common Commands

```bash
# Development
npx nx dev maple-spruce            # Start dev server (http://localhost:3000)
npx nx build maple-spruce          # Production build
npx nx run maple-spruce:typecheck  # TypeScript check

# Functions
npx nx build functions             # Build Cloud Functions
firebase emulators:start           # Run Functions emulator locally

# Testing
npx nx e2e maple-spruce-e2e        # Run Playwright tests

# Utilities
npx nx graph                       # View dependency graph
npx nx affected -t build           # Build affected projects
```

## Deployment

| Target | Method |
|--------|--------|
| Web App | Vercel - auto-deploys on push to main |
| Functions | GitHub Actions - auto-deploys on merge to main |
| API Proxy | Firebase Hosting - rewrites to Cloud Functions |

All functions deploy to `us-east4` (Northern Virginia) via Workload Identity Federation (keyless).

## Deployed Functions

| Function | Auth | Purpose |
|----------|------|---------|
| getArtists | authenticated | List all artists |
| getArtist | authenticated | Get single artist |
| createArtist | admin | Create new artist |
| updateArtist | admin | Update artist |
| deleteArtist | admin | Delete artist |
| getProducts | authenticated | List all products |
| getProduct | authenticated | Get single product |
| createProduct | admin | Create new product |
| updateProduct | admin | Update product |
| deleteProduct | admin | Delete product |
| uploadArtistImage | admin | Upload artist photo |
| healthCheck | public | Health check endpoint |

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

## Phase 1 Roadmap

- [ ] Artist management (profiles, commission rates)
- [ ] Product management with artist attribution
- [ ] Etsy product import/sync
- [ ] Sales tracking (Etsy → Firestore)
- [ ] Monthly payout calculation
- [ ] Payout reports

Track progress: `gh issue list --label phase-1`

---

*Built with [Claude Code](https://claude.ai/claude-code)*
