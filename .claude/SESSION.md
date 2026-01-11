# Session Context

> **DIRECTIVE**: Keep this file updated after completing tasks, making decisions, or learning new context. This ensures continuity across sessions.

---

## Current Work

**Status**: Documentation and patterns complete. Ready to build features.

**Recent session** (2026-01-11): Added comprehensive SOL patterns documentation, updated all Phase 1 issues with implementation details, added dependencies to package.json.

## Deployment

| Service | URL | Notes |
|---------|-----|-------|
| **Vercel** | (check Vercel dashboard) | Auto-deploys on push to main |

**Why Vercel instead of Firebase App Hosting?**
Firebase App Hosting requires a billing account (Blaze plan). Using Vercel free tier until business checking account is set up. The `apphosting.yaml` is ready for when we switch.

## External Services Status

### Firebase
| Item | Status | Details |
|------|--------|---------|
| Project created | ✅ | `maple-and-spruce` |
| Web app registered | ✅ | `maple-and-spruce-inventory` |
| Firestore enabled | ✅ | Test mode |
| Authentication enabled | ✅ | Email/Password |
| CLI access | ✅ | `katie@mapleandsprucefolkarts.com` |
| App Hosting | ❌ | Requires billing - using Vercel for now |

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
├── ts/
│   ├── firebase/firebase-config/   # Client SDK singleton
│   ├── domain/                     # Domain types (to create)
│   ├── validation/                 # Vest suites (to create)
│   └── firebase/api-types/         # Function types (to create)
└── firebase/
    ├── database/                   # Admin SDK + repositories
    ├── functions/                  # Function utilities (to create)
    └── maple-functions/            # Individual functions (to create)
```

**Path aliases:**
- `@maple/ts/firebase/firebase-config` → Client SDK
- `@maple/firebase/database` → Admin SDK
- `@maple/ts/domain` → Domain types (planned)
- `@maple/ts/validation` → Validation suites (planned)

## CI/CD

| Workflow | Trigger | Action |
|----------|---------|--------|
| `build-check.yml` | PR to any branch | Build Next.js app |
| Vercel | Push to main | Deploy to production |

## Decisions Made

1. **No separate test environment** - Single Firebase project, single Etsy app. Internal tool with low risk.
2. **Use real Etsy shop** - Only reading data, no risk of corruption.
3. **Use `libs/` not `packages/`** - Matches mountain-sol-platform patterns for consistency.
4. **`@maple/` namespace** - Path alias prefix for all shared libraries.
5. **Followed mountain-sol patterns** - Singleton Firebase app, admin SDK setup, CI/CD workflows.
6. **Vercel for hosting** - Firebase App Hosting requires billing; Vercel free tier works for now.

## Recent Changes

| Date | Change | PR |
|------|--------|-----|
| 2026-01-11 | SOL patterns documentation, issue updates, package.json deps | (pending) |
| 2026-01-10 | App Hosting setup + Vercel deployment | #15 |
| 2026-01-10 | Reference repository documentation | #14 |
| 2026-01-10 | Firebase infrastructure setup (issue #7) | #13 |
| 2026-01-06 | Documentation improvements | #12 |

## Documentation Added (2026-01-11)

- **docs/SOL-PATTERNS-REFERENCE.md** - Comprehensive patterns from Mountain Sol with GitHub links
- **docs/PATTERNS-AND-PRACTICES.md** - Updated with Firebase Functions, Validation sections
- **package.json** - Added vest, react-query, MUI, date-fns, firebase-functions
- **GitHub issues #1-6** - Updated with implementation details and pattern references
- **.claude/AGENTS.md** - Added pattern links and implementation status

## Next Steps

1. **Create infrastructure libraries**:
   - `libs/ts/domain/` - Domain types
   - `libs/ts/validation/` - Vest suites
   - `libs/firebase/functions/` - Function utilities
2. **Implement issue #2** - Artist CRUD
3. **Implement issue #3** - Product management
4. **Wait for Etsy approval** - Then implement issue #4
5. **Set up Firebase billing** - When ready, switch from Vercel to App Hosting

---

*Last updated: 2026-01-11*
