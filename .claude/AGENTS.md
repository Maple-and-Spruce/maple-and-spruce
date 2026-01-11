# Agent Rules for Maple & Spruce

> Rules and context for Claude Code when working on this project

---

## Agent Directives

**IMPORTANT**: Follow these directives in every session.

1. **Keep documentation current** - Update SESSION.md after completing tasks, making decisions, or learning new context.
2. **Read before acting** - Start sessions by reading AGENTS.md and SESSION.md for context.
3. **Check GitHub issues** - Run `gh issue list --label phase-1` to see current work.
4. **Update Implementation Status** - Mark features as "In progress" or "Complete" in this file as work progresses.
5. **Use feature branches** - Never commit directly to main.

---

## Project Overview

**Maple & Spruce** is a folk arts collective platform in Morgantown, WV offering:
- Handmade goods from local artists (consignment model)
- Workshops and craft classes
- Music lessons (Suzuki method)

**Current State**: Selling on Etsy only. No physical store yet.

**Current Phase**: Phase 1 - Etsy integration & artist payout tracking

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
- #3 - Product/inventory tracking
- #4 - Etsy API integration
- #5 - Sales tracking
- #6 - Payout reports

## Implementation Status

> **Update this section as features are built.**

### Infrastructure

| Feature | Status | Location |
|---------|--------|----------|
| Firebase client SDK | Complete | `libs/ts/firebase/firebase-config/` |
| Firebase admin SDK | Complete | `libs/firebase/database/` |
| MUI theme | Not started | `apps/maple-spruce/src/lib/theme/` |
| Domain types library | Not started | `libs/ts/domain/` |
| Validation library | Not started | `libs/ts/validation/` |
| API types library | Not started | `libs/ts/firebase/api-types/` |
| Functions core library | Not started | `libs/firebase/functions/` |

### Phase 1 Features

| Feature | Status | Issue | Location |
|---------|--------|-------|----------|
| Artist CRUD | Not started | #2 | `libs/firebase/database/src/artist.repository.ts` |
| Product management | Not started | #3 | `libs/firebase/database/src/product.repository.ts` |
| Etsy integration | Not started | #4 | `libs/firebase/maple-functions/sync-etsy-*/` |
| Sales tracking | Not started | #5 | `libs/firebase/maple-functions/record-sale/` |
| Payout reports | Not started | #6 | `libs/firebase/maple-functions/calculate-payouts/` |

### External Dependencies

- [x] Firebase project created (`maple-and-spruce`)
- [x] Etsy developer account (app pending approval)
- [x] Dependencies added to package.json (vest, react-query, MUI, etc.)

## Key Documentation

| Document | Purpose |
|----------|---------|
| [.claude/SESSION.md](./SESSION.md) | **Read first** - Current work, blockers, external service status |
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

2. **Repository Pattern** - All Firestore access through repositories
   - SOL: [libs/firebase/database/src/lib/utilities/database.utility.ts](https://github.com/MountainSOLSchool/platform/blob/main/libs/firebase/database/src/lib/utilities/database.utility.ts)

3. **Library-per-Function** - Each Cloud Function in its own Nx library
   - SOL: [libs/firebase/enrollment-functions/](https://github.com/MountainSOLSchool/platform/tree/main/libs/firebase/enrollment-functions)

4. **Vest Validation** - Declarative form validation suites
   - SOL: [libs/ts/classes/classes-domain/src/lib/validation/](https://github.com/MountainSOLSchool/platform/tree/main/libs/ts/classes/classes-domain/src/lib/validation)

5. **Form State Machine** - Discriminated unions for form submission
   - SOL: [libs/angular/classes/class-management/src/lib/components/class-form/class-form.component.ts](https://github.com/MountainSOLSchool/platform/blob/main/libs/angular/classes/class-management/src/lib/components/class-form/class-form.component.ts) (lines 89-94)

6. **Function Builder** - Consistent Cloud Function structure
   - SOL: [libs/firebase/functions/src/lib/utilities/functions.utility.ts](https://github.com/MountainSOLSchool/platform/blob/main/libs/firebase/functions/src/lib/utilities/functions.utility.ts)

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
│   ├── (admin)/           # Admin routes (protected)
│   ├── (public)/          # Public routes
│   └── api/               # API routes
├── components/            # React components
├── hooks/                 # Custom hooks
├── lib/
│   ├── firebase/         # Firebase setup
│   └── theme/            # MUI theme
└── types/                # TypeScript types
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

### Never Commit

- `.env.local` files
- Firebase service account keys
- API keys or tokens

### Required Variables

See [PATTERNS-AND-PRACTICES.md](../docs/PATTERNS-AND-PRACTICES.md#environment-variables)

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
