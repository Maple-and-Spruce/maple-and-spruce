# Maple & Spruce

Digital platform for Maple & Spruce - a folk arts collective offering handmade goods, workshops, and music lessons in Morgantown, WV.

**Current Phase**: Etsy integration & artist payout tracking (no physical store yet)

## Quick Start

```bash
# Install dependencies
npm install

# Run the development server
npx nx serve maple-spruce

# Open http://localhost:3000
```

## Project Structure

```
maple-and-spruce/
├── .claude/                        # Claude Code configuration
│   ├── CLAUDE.md                  # Quick reference for Claude
│   └── AGENTS.md                  # Detailed agent rules
├── apps/
│   ├── maple-spruce/              # Main Next.js application
│   └── maple-spruce-e2e/          # Playwright e2e tests
├── packages/                       # Shared libraries (to be created)
│   ├── ui/                        # Shared UI components
│   ├── domain/                    # Domain models & types
│   └── firebase/                  # Firebase utilities & repositories
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

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 + React 19 |
| Monorepo | Nx |
| UI | MUI (Material Design) |
| Database | Firebase Firestore |
| Auth | Firebase Authentication |
| Backend | Firebase Cloud Functions |
| Payments | Stripe (planned) |
| Testing | Playwright |

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
npx nx serve maple-spruce          # Start dev server
npx nx build maple-spruce          # Production build
npx nx test maple-spruce           # Run tests

# E2E Testing
npx nx e2e maple-spruce-e2e        # Run Playwright tests

# Utilities
npx nx graph                        # View dependency graph
npx nx affected -t build           # Build affected projects
```

## Environment Variables

Create `.env.local` in `apps/maple-spruce/`:

```bash
# Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Stripe (future)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Etsy
ETSY_API_KEY=
ETSY_ACCESS_TOKEN=
ETSY_SHOP_ID=
```

## GitHub Issues

Track progress via GitHub Issues:
- [Phase 1 Epic: Etsy + Artist Payouts](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/1)
- [All Issues](https://github.com/Maple-and-Spruce/maple-and-spruce/issues)

---

*Built with Claude Code*
