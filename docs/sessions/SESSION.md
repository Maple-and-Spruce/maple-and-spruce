# Session Context

> **DIRECTIVE**: Keep this file updated with current work status. Archive completed sessions to `history/YYYY-MM-DD.md`.

---

## Current Status

**Date**: 2026-01-19
**Status**: ✅ Storybook implementation complete

### Completed Today
- **Storybook 10 implementation:**
  - Installed and configured `@storybook/nextjs` with Nx integration
  - Created mock data fixtures for artists, products, categories
  - Created Firebase mock utilities
  - Wrote stories for all 15 components with proper fixtures and states
  - Added accessibility addon (`@storybook/addon-a11y`)
  - Added Storybook build to CI workflow (`.github/workflows/build-check.yml`)
  - Created Chromatic workflow for visual regression (`.github/workflows/chromatic.yml`)
  - Updated documentation (PATTERNS-AND-PRACTICES.md, DECISIONS.md ADR-014, AGENTS.md)

### Previous Work
- Fixed ProductForm status enum mismatch
- Added quantity field to ProductForm
- Fixed Square batchUpsert duplicate object error (nest variations in items)
- Fixed variation lookup (check both relatedObjects and itemData.variations)
- **Added global Category system:**
  - Category domain types, API types, validation
  - CategoryRepository for Firestore
  - 5 Cloud Functions: getCategories, createCategory, updateCategory, deleteCategory, reorderCategories
  - useCategories hook
- **Replaced card-based inventory with MUI DataGrid table:**
  - ProductDataTable component with sortable columns
  - ProductFilterToolbar with search, category, artist, status, in-stock filters
  - Category dropdown in ProductForm
- **Category management UI:**
  - /categories page with full CRUD
  - CategoryForm, CategoryList, DeleteConfirmDialog components
  - Navigation link added to AppShell
  - **Drag-and-drop category ordering** using @dnd-kit (removed numeric order field from form)
  - Added `reorderCategories` Cloud Function - batch updates all order values atomically
- **Design token system:**
  - Created comprehensive design tokens in `lib/theme/theme.ts`
  - Semantic tokens: colors, surfaces, borders, text, spacing, radii, shadows
  - Swapped primary (brown/action) and secondary (sage green/header) for better UX
  - White backgrounds for inputs and tables
  - Sage-tinted table headers (`#C8D4C2`) for visual distinction
  - CSS custom properties for non-MUI usage

### Next Steps
1. **Storybook deployment:**
   - Create Chromatic account and add `CHROMATIC_PROJECT_TOKEN` to GitHub secrets
   - Set up Vercel project for Storybook at `storybook.maple-and-spruce.com`
2. Deploy updated functions to dev and prod
3. Create initial categories (Pottery, Textiles, Jewelry, etc.)
4. Etsy Integration (#4) - waiting for app approval
5. Square reconciliation UI improvements

### Blockers
- Etsy app still pending approval
- Chromatic project token needed for visual regression CI

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
| Production | `prod` ✅ |
| Development | `dev` ✅ |

### Storybook Commands
```bash
# Run Storybook locally
npx nx run maple-spruce:storybook

# Build Storybook
npx nx run maple-spruce:build-storybook
```

### Deploy Commands
```bash
# Deploy functions to dev
npx nx run functions:build && firebase deploy --only functions --project=maple-and-spruce-dev

# Deploy functions to prod
npx nx run functions:build && firebase deploy --only functions --project=maple-and-spruce
```

### New Category Functions
- `getCategories` - List all categories (ordered by display order)
- `createCategory` - Create new category (admin only)
- `updateCategory` - Update category (admin only)
- `deleteCategory` - Delete category (admin only, fails if products use it)
- `reorderCategories` - Batch reorder all categories (admin only, renormalizes order values)

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
