# Maple & Spruce

A folk arts collective in Morgantown, WV offering handmade goods from local artists, workshops, and music lessons (Suzuki method).

## What We're Building

- **Admin Platform** - Manage artists, products, classes, and lessons
- **Public Website** - Webflow site showcasing artists and offerings
- **Class Registration** - Online booking and payment for workshops
- **Music Lessons** - Intro lessons and recurring scheduling

## Current Status

| Phase | Focus | Status |
|-------|-------|--------|
| 1 | Admin Foundation (artists, products, Square) | ✅ Complete |
| 2 | Public Website (Webflow integration) | **In Progress** |
| 3 | Classes & Workshops | Planned |
| 4 | Music Lessons | Planned |
| 5 | Store Opening & Sales Tracking | When store opens |

## Live URLs

| Environment | Web App |
|-------------|---------|
| Production | [mapleandsprucefolkarts.com](https://mapleandsprucefolkarts.com) |
| Development | [dev.mapleandsprucefolkarts.com](https://dev.mapleandsprucefolkarts.com) |

## Quick Start

```bash
npm install
npx nx dev maple-spruce
# Open http://localhost:3000
```

## Tech Stack

- **Frontend**: Next.js 15, React 19, MUI
- **Backend**: Firebase (Firestore, Auth, Cloud Functions)
- **POS**: Square (catalog & inventory sync)
- **Payments**: Stripe (for classes/lessons)
- **Public Site**: Webflow
- **Monorepo**: Nx

## Documentation

| Document | Audience | Purpose |
|----------|----------|---------|
| [Requirements](docs/REQUIREMENTS.md) | All | Business requirements & roadmap |
| [Decisions](docs/DECISIONS.md) | Technical | Architecture Decision Records |
| [Patterns](docs/PATTERNS-AND-PRACTICES.md) | Developers | Code patterns & examples |
| [AGENTS.md](AGENTS.md) | AI/Claude | Detailed context for AI assistants |

## Common Commands

```bash
# Development
npx nx dev maple-spruce              # Web app dev server
npx nx run functions:serve           # Functions emulator

# Build & Test
npx nx build maple-spruce            # Build web app
npx nx build functions               # Build functions
npx nx run maple-spruce:storybook    # Component library

# Deploy (automatic on merge to main)
# - Web app → Vercel
# - Functions → Firebase (us-east4)
```

## Brand Colors

| Color | Hex | Usage |
|-------|-----|-------|
| Cream | `#D5D6C8` | Backgrounds |
| Dark Brown | `#4A3728` | Headings |
| Sage Green | `#6B7B5E` | Primary/buttons |
| Warm Gray | `#7A7A6E` | Body text |

---

*Built with [Claude Code](https://claude.ai/code)*
