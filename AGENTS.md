# Agent Rules for Maple & Spruce

> Project context for AI assistants working on this codebase. Keep under 150 lines.

---

## Directives

1. **NEVER read, access, or display secrets or credentials** -- PRIME DIRECTIVE. Never read `.secret.local`, `.env` files with tokens, or display API keys. Warn the user to rotate if seen accidentally.
2. **Keep documentation current** -- Follow the self-updating doc workflow in .claude/CLAUDE.md and the `session-management` skill.
3. **Read before acting** -- Start sessions by reading AGENTS.md, .claude/CLAUDE.md, and `docs/sessions/SESSION.md`.
4. **Check GitHub issues** -- Run `gh issue list` for current work. Issues are the source of truth.
5. **Use feature branches** -- Never commit directly to main. See `git-workflow` skill.
6. **Always write tests** -- Unit tests for new functions/utilities. Run `npm test` before PRs. Use `vi.mock()` for Cloud Functions (ADR-017).
7. **Use GitHub issues for tracking** -- Reference issues in PRs (`Closes #XX`).
8. **Never deploy manually** -- CI/CD deploys on merge to main. Claude writes code and creates PRs.
9. **No package.json in libs** -- Root `package.json` and `tsconfig.base.json` manage all dependencies.
10. **Function naming convention** -- `firebase-maple-functions-{name}`. See `create-cloud-function` skill.
11. **gcloud commands OK** -- Run gcloud after user logs in via `gcloud auth login`.

---

## Project Overview

**Maple & Spruce** is a folk arts collective platform in Morgantown, WV offering:
- Handmade goods from local artists (consignment model)
- Workshops and craft classes
- Music lessons (Suzuki method)

**Current State**: Selling on Etsy. Building public website on Webflow.
**Current Phase**: Phase 3 Complete -- Classes & Workshops (All subphases done)

## Phased Roadmap

| Phase | Focus | Status |
|-------|-------|--------|
| 1 | Admin Foundation & Artist Platform | Complete |
| 2 | Public Website (Webflow Integration) | Complete |
| 3 | Classes & Workshops (3a/3b/3c) | Complete |
| 4 | Music Lessons | Next |
| 5 | Store Opening & Sales Tracking | Future |

**Deferred** (Phase 5): #4 Etsy API, #5 Sales tracking, #6 Payout reports

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15 + React 19 |
| UI | MUI (Material Design) |
| Database | Firebase Firestore |
| Auth | Firebase Authentication |
| Backend | Firebase Cloud Functions (us-east4) |
| Payments | Square |
| Monorepo | Nx |

## Key Patterns

- **Repository Pattern** -- All Firestore via repositories, never raw `getDocs`
- **Library-per-Function** -- Each Cloud Function in its own Nx library
- **Vest Validation** -- Declarative form validation suites in `libs/ts/validation/`
- **RequestState\<T\>** -- Discriminated unions for async state, no boolean `isLoading`
- **Preact Signals** -- Form state management (ADR-015)
- **Function Builder** -- Consistent Cloud Function structure via `@maple/firebase/functions`

## Reference Repository

Mountain Sol Platform: https://github.com/MountainSOLSchool/platform
Local: `/Users/$USER/GitHub/platform`

## Documentation Map

| Document | Purpose |
|----------|---------|
| `docs/sessions/SESSION.md` | **Read first** -- Current work status |
| `docs/reference/REQUIREMENTS.md` | Business requirements & roadmap |
| `docs/reference/implementation-status.md` | Feature tracking |
| `docs/reference/deployed-functions.md` | All deployed Cloud Functions |
| `docs/reference/code-standards.md` | Naming, TypeScript, patterns |
| `docs/architecture/DECISIONS.md` | Architecture Decision Records |
| `docs/architecture/PATTERNS-AND-PRACTICES.md` | Code patterns & examples |
| `docs/architecture/SOL-PATTERNS-REFERENCE.md` | Mountain Sol reference patterns |
| `docs/architecture/ci-cd.md` | CI/CD pipeline details |
| `docs/guides/environment-setup.md` | Secrets, env detection, webhooks |
| `docs/reference/BACKLOG.md` | Future feature ideas |

## Skills (`.claude/skills/`)

| Skill | Use when |
|-------|----------|
| `create-cloud-function` | Adding a new Firebase Cloud Function |
| `git-workflow` | Creating branches, commits, or PRs |
| `local-development` | Running locally, troubleshooting emulators |
| `session-management` | Updating docs, managing sessions |

## Brand Colors

| Name | Hex | Usage |
|------|-----|-------|
| Cream | `#D5D6C8` | Backgrounds |
| Dark Brown | `#4A3728` | Headings |
| Sage Green | `#6B7B5E` | Primary/buttons |
| Warm Gray | `#7A7A6E` | Body text |

Always use MUI theme tokens, not hardcoded hex values.
