# Agent Rules for Maple & Spruce

> Rules and context for Claude Code when working on this project

---

## Project Overview

**Maple & Spruce** is a folk arts collective platform in Morgantown, WV offering:
- Handmade goods from local artists (consignment model)
- Workshops and craft classes
- Music lessons (Suzuki method)

**Current State**: Selling on Etsy only. No physical store yet.

**Current Phase**: Phase 1 - Etsy integration & artist payout tracking

## Key Documentation

| Document | Purpose |
|----------|---------|
| [docs/REQUIREMENTS.md](../docs/REQUIREMENTS.md) | Business requirements, phased roadmap, data models |
| [docs/PATTERNS-AND-PRACTICES.md](../docs/PATTERNS-AND-PRACTICES.md) | Code patterns, architecture, examples |
| [docs/DECISIONS.md](../docs/DECISIONS.md) | Architecture Decision Records (ADRs) |
| [docs/BACKLOG.md](../docs/BACKLOG.md) | Ideas and future features |

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
