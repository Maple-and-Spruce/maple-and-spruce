# Agent Rules for Maple & Spruce

> Detailed behavioral rules for Claude Code when working on this project

---

## Git Workflow

### Branch Strategy

**Always work on feature branches, never directly on `main`.**

```bash
# Create a new feature branch
git checkout main
git pull origin main
git checkout -b feature/7-firebase-setup

# Branch naming conventions:
# feature/[issue-number]-[short-description]
# fix/[issue-number]-[short-description]
# chore/[description]
```

**Examples:**
- `feature/7-firebase-setup`
- `feature/2-artist-management`
- `fix/15-payout-calculation-bug`
- `chore/update-dependencies`

### Commit Rules

1. **Commit frequently** - Small, focused commits are better than large ones
2. **Clear messages** - Describe what and why, not how
3. **Reference issues** - Include `#issue-number` when relevant

**Commit message format:**
```
<type>: <short description>

[optional body with more detail]

[optional: Fixes #123, Relates to #456]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code change that doesn't add feature or fix bug
- `docs`: Documentation only
- `chore`: Maintenance tasks
- `test`: Adding or updating tests

**Examples:**
```bash
git commit -m "feat: add artist creation form (#2)"
git commit -m "fix: correct commission calculation for edge cases (#5)"
git commit -m "refactor: extract Firestore queries to repository"
git commit -m "docs: update README with setup instructions"
```

### Pull Request Workflow

**Always create PRs for features, never merge directly to main.**

1. Push feature branch to origin
2. Create PR with clear description
3. Reference the GitHub issue
4. Wait for review (or self-review if solo)

```bash
# Push and create PR
git push -u origin feature/7-firebase-setup

# Create PR via gh CLI
gh pr create --title "feat: Firebase project setup (#7)" --body "## Summary
- Set up Firebase project configuration
- Add Firestore security rules
- Create initial collections

Closes #7"
```

**PR Description Template:**
```markdown
## Summary
[Brief description of changes]

## Changes
- [Change 1]
- [Change 2]

## Testing
- [ ] Tested locally
- [ ] Added/updated tests (if applicable)

## Related Issues
Closes #[issue-number]
```

---

## Code Standards

### File Organization

Follow the structure defined in [PATTERNS-AND-PRACTICES.md](../docs/PATTERNS-AND-PRACTICES.md):

```
apps/maple-spruce/src/
├── app/                    # Next.js App Router pages
│   ├── (admin)/           # Admin routes (protected)
│   ├── (public)/          # Public routes
│   └── api/               # API routes
├── components/            # React components
├── hooks/                 # Custom React hooks
├── lib/                   # Utilities
│   ├── firebase/         # Firebase client setup
│   └── theme/            # MUI theme
└── types/                # TypeScript types
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `ArtistCard.tsx` |
| Files | kebab-case | `artist-card.tsx` |
| Hooks | camelCase with `use` prefix | `useArtists.ts` |
| Types/Interfaces | PascalCase | `Artist`, `CreateArtistInput` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_COMMISSION_RATE` |
| Functions | camelCase | `calculatePayout()` |

### TypeScript Rules

1. **Strict mode** - No `any` types unless absolutely necessary
2. **Explicit returns** - Always type function returns
3. **Discriminated unions** - For state management (see patterns doc)

```typescript
// Good
interface Artist {
  id: string;
  name: string;
  commissionRate: number;
}

// Bad - avoid any
const artist: any = { ... };
```

### Component Patterns

1. **Use MUI components** - Don't reinvent the wheel
2. **Follow brand colors** - Use theme, not hardcoded colors
3. **Compose, don't configure** - Prefer composition over props

```typescript
// Good - uses theme
<Button color="primary">Save</Button>

// Bad - hardcoded color
<Button sx={{ backgroundColor: '#6B7B5E' }}>Save</Button>
```

### Repository Pattern

**All Firestore access goes through repositories.**

```typescript
// Good
const artists = await ArtistRepository.findAll();

// Bad - direct Firestore access in components
const snapshot = await getDocs(collection(db, 'artists'));
```

See [PATTERNS-AND-PRACTICES.md](../docs/PATTERNS-AND-PRACTICES.md) for full examples.

---

## Working with Issues

### Before Starting

1. Check if issue exists in GitHub
2. If not, create one or ask for clarification
3. Assign yourself (or note you're working on it)
4. Create feature branch

### Issue Reference

Always connect work to issues:

```bash
# In commit messages
git commit -m "feat: add artist list view (#2)"

# In PR descriptions
Closes #2
Relates to #1
```

### Creating Issues

If you discover work that needs to be done:

```bash
gh issue create \
  --title "Bug: Commission calculation off by one cent" \
  --label "bug,phase-1" \
  --body "## Description
When calculating commission for \$99.99 items...

## Steps to Reproduce
1. Create sale for \$99.99
2. Check artist earnings

## Expected vs Actual
..."
```

---

## Documentation Updates

### When to Update Docs

1. **New patterns** - Add to PATTERNS-AND-PRACTICES.md
2. **Architecture decisions** - Add ADR to DECISIONS.md
3. **New features planned** - Update REQUIREMENTS.md
4. **Ideas/future work** - Add to BACKLOG.md

### ADR Format

When making significant technical decisions:

```markdown
## ADR-XXX: [Title]

**Status:** Accepted
**Date:** YYYY-MM-DD

### Context
[Why are we making this decision?]

### Decision
[What did we decide?]

### Rationale
[Why is this the right choice?]

### Consequences
[What are the tradeoffs?]
```

---

## Testing Approach

### What to Test

1. **Business logic** - Payout calculations, commission math
2. **Repository methods** - Data access patterns
3. **Critical user flows** - E2E tests for important paths

### Test File Location

```
packages/domain/src/__tests__/     # Unit tests for domain logic
apps/maple-spruce-e2e/src/         # E2E tests with Playwright
```

---

## Environment & Secrets

### Never Commit

- `.env.local` files
- Firebase service account keys
- API keys or tokens
- Any credentials

### Environment Variables

Required variables are documented in [PATTERNS-AND-PRACTICES.md](../docs/PATTERNS-AND-PRACTICES.md#environment-variables).

If you need a new env var:
1. Add to `.env.example` (without value)
2. Document in patterns doc
3. Note in PR description

---

## Communication

### When to Ask

- Requirements are unclear
- Multiple valid approaches exist
- Breaking changes needed
- Blocked by missing credentials/access

### Status Updates

When working on multi-step tasks:
1. Use TodoWrite to track progress
2. Commit incrementally
3. Push work-in-progress if stepping away

---

## Quick Checklist

Before committing:
- [ ] On a feature branch (not main)
- [ ] Code follows patterns doc
- [ ] No hardcoded credentials
- [ ] TypeScript compiles without errors
- [ ] Commit message is clear and references issue

Before creating PR:
- [ ] All commits are pushed
- [ ] PR description explains changes
- [ ] Related issue is referenced
- [ ] Self-reviewed the diff

Before merging:
- [ ] PR is approved (or self-reviewed if solo)
- [ ] No merge conflicts
- [ ] CI passes (when set up)
