# Agent Rules for Maple & Spruce

> Rules and context for Claude Code when working on this project

---

## Agent Directives

**IMPORTANT**: Follow these directives in every session.

1. **NEVER read, access, or display secrets or credentials** - This is a PRIME DIRECTIVE.
   - Never read `.secret.local`, `.env` files containing tokens, or any file that might contain API keys
   - Never run commands that output secrets (e.g., `firebase functions:secrets:access`)
   - Never display tokens, API keys, or passwords in chat - even sandbox/development ones
   - Use Firebase CLI interactively for the user to set secrets themselves
   - If you accidentally see a secret, do not repeat it - warn the user to rotate it
2. **Keep documentation current** - Update `docs/sessions/SESSION.md` after completing tasks. Archive completed sessions to `docs/sessions/history/YYYY-MM-DD.md`.
3. **Read before acting** - Start sessions by reading AGENTS.md and `docs/sessions/SESSION.md` for context.
4. **Check GitHub issues** - Run `gh issue list --label phase-1` to see current work.
5. **Update Implementation Status** - Mark features as "In progress" or "Complete" in this file as work progresses.
6. **Use feature branches** - Never commit directly to main.

---

## Project Overview

**Maple & Spruce** is a folk arts collective platform in Morgantown, WV offering:
- Handmade goods from local artists (consignment model)
- Workshops and craft classes
- Music lessons (Suzuki method)

**Current State**: Selling on Etsy only. No physical store yet.

**Current Phase**: Phase 1 - Square foundation, then Etsy integration & artist payout tracking

## GitHub Issues

**Always check `gh issue list` for current work.** Issues are the source of truth for tasks.

| Command | Purpose |
|---------|---------|
| `gh issue list --label phase-1` | Current phase work |
| `gh issue list --label epic` | High-level epics |
| `gh issue view <number>` | Issue details |

**Phase 1 Issues:**
- #1 - Epic: Phase 1 overview
- #7 - Firebase infrastructure setup
- #2 - Artist management CRUD
- #3 - Product/inventory tracking (infrastructure complete, feature in progress)
- #4 - Etsy API integration
- #5 - Sales tracking
- #6 - Payout reports
- #22 - Deploy Firebase Functions to production
- #23 - Set up CI/CD for Firebase Functions
- #24 - Add testing infrastructure

## Implementation Status

> **Update this section as features are built.**

### Infrastructure

| Feature | Status | Location |
|---------|--------|----------|
| Firebase client SDK | Complete | `libs/ts/firebase/firebase-config/` |
| Firebase admin SDK | Complete | `libs/firebase/database/` |
| MUI theme | Complete | `apps/maple-spruce/src/lib/theme/` |
| Domain types library | Complete | `libs/ts/domain/` |
| Validation library | Complete | `libs/ts/validation/` |
| API types library | Complete | `libs/ts/firebase/api-types/` |
| Functions core library | Complete | `libs/firebase/functions/` |
| Functions app | Complete | `apps/functions/` |
| Authentication | Complete | `apps/maple-spruce/src/components/auth/` |
| Navigation (responsive) | Complete | `apps/maple-spruce/src/components/layout/` |

### Phase 1 Features

| Feature | Status | Issue | Location |
|---------|--------|-------|----------|
| Artist CRUD | Complete | #2 | `libs/firebase/maple-functions/get-artists/`, etc. |
| Square integration | Complete | #69 | `libs/firebase/square/` |
| Product management | Partial | #3 | `libs/firebase/maple-functions/get-products/`, etc. |
| Etsy integration | Not started | #4 | `libs/firebase/maple-functions/sync-etsy-*/` |
| Sales tracking | Not started | #5 | `libs/firebase/maple-functions/record-sale/` |
| Payout reports | Not started | #6 | `libs/firebase/maple-functions/calculate-payouts/` |

#### Square Integration (#69) - Complete

Square foundation is complete. Ready for Product Management integration.

| Task | Status | Notes |
|------|--------|-------|
| Square secrets configured | ✅ | Per-project pattern (same name in dev/prod projects) |
| Square utility library | ✅ | `libs/firebase/square/` with Catalog & Inventory services |
| Product type refactored | ✅ | `squareCache` for cached data, clear ownership boundaries |
| ADR for sync strategy | ✅ | ADR-013: webhooks + lazy refresh + periodic sync |
| Webhooks | ✅ | `squareWebhook` function deployed to both environments |
| Dev environment | ✅ | Separate Firebase project + Vercel app |

#### Product Management (#3) - Remaining Work

1. ~~**ProductForm status enum mismatch**~~ - Fixed
2. ~~**ProductForm missing quantity field**~~ - Fixed
3. **Wire up CRUD to Square** - Product create/update calls Square first
4. **Artist dropdown** - Replace manual artistId text input
5. **Artist info display** - Show artist name in ProductList

### Infrastructure Tasks

| Task | Status | Issue |
|------|--------|-------|
| Deploy Functions to Firebase | Complete | #22 |
| CI/CD for Functions | Complete | #23 |
| Testing infrastructure | Not started | #24 |

#### CI/CD Details (#23)

- **PR Build Check**: `.github/workflows/build-check.yml` - Runs on every PR:
  - Security audit (`npm audit --audit-level=high`)
  - TypeScript typecheck (`nx run maple-spruce:typecheck`)
  - Build web app and functions
- **Functions Deploy**: `.github/workflows/firebase-functions-merge.yml` - Deploys only affected functions on merge to main
- **Auth**: Workload Identity Federation (keyless) - no secrets required
- **Region**: All functions deploy to `us-east4` (Northern Virginia, close to WV business)
- **Codebase**: `maple-functions` - functions are filtered by this codebase prefix

#### Functions Deployment Pattern

Functions follow Mountain Sol's auto-generated package.json pattern:
- `apps/functions/project.json` has `generatePackageJson: true`
- No static `package.json` in `apps/functions/`
- Nx auto-detects dependencies from imports during build
- esbuild bundles code with `thirdParty: false` (externalize deps for Firebase to install)

**Deployed Functions** (all in `us-east4`):
- `getArtists`, `getArtist`, `createArtist`, `updateArtist`, `deleteArtist`
- `getProducts`, `getProduct`, `createProduct`, `updateProduct`, `deleteProduct`
- `uploadArtistImage`, `healthCheck`, `squareWebhook`

### External Dependencies

- [x] Firebase projects created (`maple-and-spruce` prod, `maple-and-spruce-dev` dev)
- [x] Square developer account (production & sandbox credentials configured)
- [x] Etsy developer account (app pending approval)
- [x] Vercel projects (prod + dev with hostname-based routing)
- [x] Dependencies added to package.json (vest, react-query, MUI, etc.)

## Key Documentation

| Document | Purpose |
|----------|---------|
| [docs/sessions/SESSION.md](../docs/sessions/SESSION.md) | **Read first** - Current work, blockers, quick reference |
| [docs/sessions/history/](../docs/sessions/history/) | Past session logs with detailed context |
| [docs/REQUIREMENTS.md](../docs/REQUIREMENTS.md) | Business requirements, phased roadmap, data models |
| [docs/PATTERNS-AND-PRACTICES.md](../docs/PATTERNS-AND-PRACTICES.md) | Code patterns, architecture, examples |
| [docs/DECISIONS.md](../docs/DECISIONS.md) | Architecture Decision Records (ADRs) |
| [docs/BACKLOG.md](../docs/BACKLOG.md) | Ideas and future features |

## Reference Repository

**Mountain Sol Platform** serves as the reference implementation for patterns used in this project.

- **GitHub**: https://github.com/MountainSOLSchool/platform
- **Local path**: `/Users/$USER/GitHub/platform`

### Pattern Documentation

**IMPORTANT**: Before implementing features, consult these documents:

| Document | Purpose |
|----------|---------|
| [docs/SOL-PATTERNS-REFERENCE.md](../docs/SOL-PATTERNS-REFERENCE.md) | Detailed SOL patterns with file links |
| [docs/PATTERNS-AND-PRACTICES.md](../docs/PATTERNS-AND-PRACTICES.md) | Maple & Spruce adaptations |

### Key Patterns to Follow

1. **Async State (`RequestState<T>`)** - Never use boolean `isLoading`
   - SOL: [libs/angular/request/src/lib/models/requested.type.ts](https://github.com/MountainSOLSchool/platform/blob/main/libs/angular/request/src/lib/models/requested.type.ts)
   - Maple: `libs/ts/domain/src/lib/request-state.ts`

2. **Repository Pattern** - All Firestore access through repositories
   - SOL: [libs/firebase/database/src/lib/utilities/database.utility.ts](https://github.com/MountainSOLSchool/platform/blob/main/libs/firebase/database/src/lib/utilities/database.utility.ts)
   - Maple: `libs/firebase/database/src/lib/product.repository.ts`

3. **Library-per-Function** - Each Cloud Function in its own Nx library
   - SOL: [libs/firebase/enrollment-functions/](https://github.com/MountainSOLSchool/platform/tree/main/libs/firebase/enrollment-functions)
   - Maple: `libs/firebase/maple-functions/get-artists/`, `libs/firebase/maple-functions/create-product/`, etc.

4. **Vest Validation** - Declarative form validation suites
   - SOL: [libs/ts/classes/classes-domain/src/lib/validation/](https://github.com/MountainSOLSchool/platform/tree/main/libs/ts/classes/classes-domain/src/lib/validation)
   - Maple: `libs/ts/validation/`

5. **Form State Machine** - Discriminated unions for form submission
   - SOL: [libs/angular/classes/class-management/src/lib/components/class-form/class-form.component.ts](https://github.com/MountainSOLSchool/platform/blob/main/libs/angular/classes/class-management/src/lib/components/class-form/class-form.component.ts) (lines 89-94)

6. **Function Builder** - Consistent Cloud Function structure
   - SOL: [libs/firebase/functions/src/lib/utilities/functions.utility.ts](https://github.com/MountainSOLSchool/platform/blob/main/libs/firebase/functions/src/lib/utilities/functions.utility.ts)
   - Maple: `libs/firebase/functions/src/lib/functions.utility.ts`

7. **AuthGuard Pattern** - Wrap app in root layout with route protection
   - SOL: [apps/student-portal/app/auth-guard.tsx](https://github.com/MountainSOLSchool/platform/blob/main/apps/student-portal/app/auth-guard.tsx)
   - Maple: `apps/maple-spruce/src/components/auth/AuthGuard.tsx`

8. **Admin Role Authorization** - Check roles via Firestore `admins` collection
   - Maple: `libs/firebase/functions/src/lib/auth.utility.ts`

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15 + React 19 |
| UI | MUI (Material Design) |
| Database | Firebase Firestore |
| Auth | Firebase Authentication |
| Backend | Firebase Cloud Functions |
| Payments | Stripe (future) |
| Monorepo | Nx |

## Brand Colors

| Name | Hex | Usage |
|------|-----|-------|
| Cream | `#D5D6C8` | Backgrounds |
| Dark Brown | `#4A3728` | Headings, primary text |
| Sage Green | `#6B7B5E` | Buttons, accents (primary) |
| Warm Gray | `#7A7A6E` | Body text |

**Always use MUI theme colors, not hardcoded hex values.**

---

## Git Workflow

### Branch Protection

**`main` branch is protected. All changes must go through pull requests.**

- Direct pushes to `main` are blocked
- All work happens on feature branches
- PRs required even for solo development

### Branch Strategy

**Always work on feature branches.**

```bash
# Create a new feature branch
git checkout main
git pull origin main
git checkout -b feature/7-firebase-setup
```

**Branch naming:**
- `feature/[issue-number]-[short-description]`
- `fix/[issue-number]-[short-description]`
- `chore/[description]`

### Commit Rules

1. **Commit frequently** - Small, focused commits
2. **Clear messages** - Describe what and why
3. **Reference issues** - Include `#issue-number`

**Format:**
```
<type>: <short description>

[optional body]

[Fixes #123]
```

**Types:** `feat`, `fix`, `refactor`, `docs`, `chore`, `test`

**Examples:**
```bash
git commit -m "feat: add artist creation form (#2)"
git commit -m "fix: correct commission calculation (#5)"
```

### Pull Request Workflow

**Always create PRs, never merge directly to main.**

```bash
git push -u origin feature/7-firebase-setup
gh pr create --title "feat: Firebase setup (#7)" --body "..."
```

**PR template:**
```markdown
## Summary
[Brief description]

## Changes
- [Change 1]
- [Change 2]

## Testing
- [ ] Tested locally

Closes #[issue-number]
```

---

## Code Standards

### File Organization

```
apps/maple-spruce/src/
├── app/                    # Next.js App Router
│   ├── artists/           # Artist management page
│   ├── inventory/         # Inventory management page
│   ├── login/             # Login page (public)
│   ├── auth-guard-wrapper.tsx  # Client component for AuthGuard
│   ├── layout.tsx         # Root layout with providers
│   └── page.tsx           # Home page
├── components/
│   ├── artists/           # ArtistList, ArtistForm, etc.
│   ├── auth/              # AuthGuard, UserMenu
│   ├── inventory/         # ProductList, ProductForm, etc.
│   └── layout/            # AppShell (shared nav component)
├── config/
│   └── public-routes.ts   # Routes that don't require auth
├── hooks/                 # useAuth, useProducts, useArtists
└── lib/
    └── theme/             # MUI theme + ThemeProvider

apps/functions/src/
└── index.ts               # Firebase Functions entry point
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `ArtistCard.tsx` |
| Files | kebab-case | `artist-card.tsx` |
| Hooks | `use` prefix | `useArtists.ts` |
| Types | PascalCase | `Artist` |
| Constants | SCREAMING_SNAKE | `MAX_COMMISSION_RATE` |

### TypeScript

- **Strict mode** - No `any` types
- **Explicit returns** - Type all function returns
- **Discriminated unions** - For state (not boolean flags)

### Repository Pattern

**All Firestore access goes through repositories.**

```typescript
// Good
const artists = await ArtistRepository.findAll();

// Bad
const snapshot = await getDocs(collection(db, 'artists'));
```

### MUI Components

```typescript
// Good - uses theme
<Button color="primary">Save</Button>

// Bad - hardcoded
<Button sx={{ backgroundColor: '#6B7B5E' }}>Save</Button>
```

---

## Working with Issues

### Before Starting Work

1. Check GitHub issues for the task
2. Create feature branch: `feature/[issue]-[desc]`
3. Reference issue in commits and PR

### Creating Issues

```bash
gh issue create \
  --title "Bug: Commission calculation issue" \
  --label "bug,phase-1" \
  --body "## Description..."
```

### Issue Labels

- `phase-1`: Etsy + artist tracking (current)
- `phase-2`: Store opening + POS
- `phase-3`: Classes & workshops
- `phase-4`: Music lessons
- `epic`: Large feature area

---

## Documentation Updates

| Change | Update |
|--------|--------|
| New code pattern | PATTERNS-AND-PRACTICES.md |
| Architecture decision | DECISIONS.md (new ADR) |
| New feature planned | REQUIREMENTS.md |
| Future idea | BACKLOG.md |

---

## Environment & Secrets

### Per-Project Secrets Pattern

**Same secret names in each Firebase project, different values:**

| Secret | Dev Project | Prod Project |
|--------|-------------|--------------|
| `SQUARE_ACCESS_TOKEN` | Sandbox token | Production token |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | Sandbox key | Production key |

**No more `_PROD` suffix** - the project itself determines the environment.

### Environment Detection

The web app selects Firebase config in this order:

1. **`NEXT_PUBLIC_FIREBASE_ENV`** environment variable (checked first)
   - Set in Vercel for deployed apps
   - Values: `dev` or `prod`
2. **Hostname fallback** for local development:
   - `localhost` or `127.0.0.1` → dev
   - `*-dev.*` hostname → dev
   - Everything else → prod

**Vercel Environment Variables (required):**
| Project | Variable | Value |
|---------|----------|-------|
| Production | `NEXT_PUBLIC_FIREBASE_ENV` | `prod` |
| Development | `NEXT_PUBLIC_FIREBASE_ENV` | `dev` |

**No `.env.local` needed** - Firebase client config is hardcoded in `libs/ts/firebase/firebase-config/`.

### Square Webhook URLs

**IMPORTANT**: Webhook signature verification requires the URL to match exactly what's registered in Square Dashboard. Use the `cloudfunctions.net` format, NOT the Cloud Run URLs.

| Environment | Webhook URL (register in Square) |
|-------------|----------------------------------|
| Production | `https://us-east4-maple-and-spruce.cloudfunctions.net/squareWebhook` |
| Development | `https://us-east4-maple-and-spruce-dev.cloudfunctions.net/squareWebhook` |

### Never Commit

- Firebase service account keys
- API keys or tokens (Square, Etsy, etc.)

### Local Development

**Running Functions Locally:**
```bash
npx nx run functions:serve
```

This command:
1. Builds the functions
2. Copies `.env.dev` to `dist/apps/functions/.env`
3. Starts watch mode for rebuilds (background)
4. Runs `firebase serve --only functions --project=dev` on port 5001

**Running Web App Locally:**
```bash
npx nx run maple-spruce:serve
```
Runs on http://localhost:3000

#### Troubleshooting Local Functions

**If the emulator prompts for environment variables:**

The Firebase emulator is not finding the `.env` file. This happens when:
- The build clears `dist/apps/functions/` before the `.env` is copied
- A stale watch process is interfering

**Fix:**
```bash
# Kill any stale processes
pkill -f "firebase serve"
pkill -f "nx run functions"

# Clean and restart
rm -rf dist/apps/functions
npx nx run functions:serve
```

**Why this happens:**
- Firebase reads `.env` from the functions source directory (`dist/apps/functions/`)
- The `nx run functions:build` clears this directory
- The serve command copies `.env.dev` after build, before starting the emulator
- If ordering is wrong or stale processes exist, the emulator starts without the `.env`

**Key indicator it's working:**
```
i  functions: Loaded environment variables from .env.
```

---

## Quick Checklists

### Before Committing
- [ ] On feature branch (not main)
- [ ] Code follows patterns doc
- [ ] No credentials committed
- [ ] TypeScript compiles
- [ ] Commit references issue

### Before PR
- [ ] Commits pushed
- [ ] PR description complete
- [ ] Issue referenced
- [ ] Self-reviewed diff

### Before Merge
- [ ] PR approved (or self-reviewed)
- [ ] No conflicts
- [ ] CI passes (when set up)
