# Session Context

> **DIRECTIVE**: Keep this file updated with current work status. Archive completed sessions to `history/YYYY-MM-DD.md`.

---

## Current Status

**Date**: 2026-01-19
**Status**: ✅ Product CRUD with Square sync working

### Completed Today
- Fixed ProductForm status enum mismatch
- Added quantity field to ProductForm
- Fixed Square batchUpsert duplicate object error (nest variations in items)
- Fixed variation lookup (check both relatedObjects and itemData.variations)

### Next Steps
1. Set `NEXT_PUBLIC_FIREBASE_ENV=prod` in production Vercel project
2. Deploy updated functions to prod
3. Etsy Integration (#4) - waiting for app approval

### Blockers
None

---

## Quick Reference

### Environments
| Environment | Web App | Firebase Project | Square |
|-------------|---------|------------------|--------|
| Production | business.mapleandsprucefolkarts.com | `maple-and-spruce` | Production API |
| Development | business-dev.mapleandsprucefolkarts.com | `maple-and-spruce-dev` | Sandbox API |

### Required Vercel Env Vars
| Project | `NEXT_PUBLIC_FIREBASE_ENV` |
|---------|---------------------------|
| Production | `prod` ⚠️ needs to be set |
| Development | `dev` ✅ |

### Deploy Commands
```bash
# Deploy functions to dev
npx nx run functions:build && cp .env.dev dist/apps/functions/.env && firebase deploy --only functions --project=maple-and-spruce-dev

# Deploy functions to prod
npx nx run functions:build && cp .env.prod dist/apps/functions/.env && firebase deploy --only functions --project=maple-and-spruce
```

### Square Webhook URLs (register in Square Dashboard)
| Environment | URL |
|-------------|-----|
| Production | `https://us-east4-maple-and-spruce.cloudfunctions.net/squareWebhook` |
| Development | `https://us-east4-maple-and-spruce-dev.cloudfunctions.net/squareWebhook` |

---

## Session History

See `history/` folder for detailed session logs:
- [2026-01-19](history/2026-01-19.md) - Dev environment fixes, product/artist integration
- [2026-01-18](history/2026-01-18.md) - Square integration foundation, dev/prod separation

---

*Last updated: 2026-01-19*
