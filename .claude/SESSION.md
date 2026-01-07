# Session Context

> **DIRECTIVE**: Keep this file updated after completing tasks, making decisions, or learning new context. This ensures continuity across sessions.

---

## Current Work

**Active Issue**: #7 - Firebase infrastructure setup (PR in progress)

**Status**: Implementation complete, PR ready for review.

## External Services Status

### Firebase
| Item | Status | Details |
|------|--------|---------|
| Project created | ✅ | `maple-and-spruce` |
| Web app registered | ✅ | `maple-and-spruce-inventory` |
| Firestore enabled | ✅ | Test mode |
| Authentication enabled | ✅ | Email/Password |
| CLI access | ✅ | `katie@mapleandsprucefolkarts.com` |

### Etsy
| Item | Status | Details |
|------|--------|---------|
| Developer account | ✅ | Created |
| App registered | ⏳ | `maple-spruce-inventory` - Pending approval |
| Keystring | ✅ | `rhcrehdphw5y3qjkf4fmdttm` |
| Shared Secret | ✅ | (stored securely) |
| Test shop | ❌ | Not needed - using real shop |

**Note**: Etsy app approval typically takes 1-2 business days.

## Project Structure

```
libs/
├── ts/firebase/firebase-config/    # Client SDK singleton (getMapleApp, getMapleAuth, getMapleFirestore)
└── firebase/database/              # Admin SDK (server-side Firestore access)
```

**Path aliases:**
- `@maple/ts/firebase/firebase-config` → Client SDK
- `@maple/firebase/database` → Admin SDK

## CI/CD

| Workflow | Trigger | Action |
|----------|---------|--------|
| `build-check.yml` | PR to any branch | Build Next.js app |
| `firebase-hosting-merge.yml` | Push to main | Deploy to Firebase Hosting |

**Required secret**: `FIREBASE_SERVICE_ACCOUNT_MAPLE_AND_SPRUCE` (needs to be added to GitHub repo)

## Decisions Made This Session

1. **No separate test environment** - Single Firebase project, single Etsy app. Internal tool with low risk.
2. **Use real Etsy shop** - Only reading data, no risk of corruption.
3. **Use `libs/` not `packages/`** - Matches mountain-sol-platform patterns for consistency.
4. **`@maple/` namespace** - Path alias prefix for all shared libraries.
5. **Followed mountain-sol patterns** - Singleton Firebase app, admin SDK setup, CI/CD workflows.

## Recent Changes

| Date | Change | PR |
|------|--------|-----|
| 2026-01-06 | Firebase infrastructure setup (issue #7) | #13 (pending) |
| 2026-01-06 | Added Implementation Status and GitHub Issues sections to AGENTS.md | #12 |
| 2026-01-06 | Fixed Supabase → Firebase in REQUIREMENTS.md | #12 |
| 2026-01-06 | Created SESSION.md for context tracking | #12 |

## Next Steps

1. **Merge PR #13** - Firebase setup
2. **Add GitHub secret** - `FIREBASE_SERVICE_ACCOUNT_MAPLE_AND_SPRUCE` for CI/CD
3. **Implement issue #2** - Artist CRUD
4. **Implement issue #3** - Product management
5. **Wait for Etsy approval** - Then implement issue #4

---

*Last updated: 2026-01-06*
