# Code Standards

## File Organization

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

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `ArtistCard.tsx` |
| Files | kebab-case | `artist-card.tsx` |
| Hooks | `use` prefix | `useArtists.ts` |
| Types | PascalCase | `Artist` |
| Constants | SCREAMING_SNAKE | `MAX_COMMISSION_RATE` |

## TypeScript

- **Strict mode** - No `any` types
- **Explicit returns** - Type all function returns
- **Discriminated unions** - For state (not boolean flags)

## Repository Pattern

**All Firestore access goes through repositories.**

```typescript
// Good
const artists = await ArtistRepository.findAll();

// Bad
const snapshot = await getDocs(collection(db, 'artists'));
```

## MUI Components

```typescript
// Good - uses theme
<Button color="primary">Save</Button>

// Bad - hardcoded
<Button sx={{ backgroundColor: '#6B7B5E' }}>Save</Button>
```

Always use MUI theme colors, not hardcoded hex values.

## Testing & Coverage

CI runs `nyc check-coverage --lines 80 --functions 80 --statements 80 --branches 50` against the merged coverage report. **80% is the CI floor; aim for ~85% on new code.** PRs that scrape by at 80.1% are fragile — a single unrelated refactor elsewhere can drag the merged number back under the line and break CI without anyone changing the tested code. 85% gives headroom while staying achievable.

What's in coverage: production `src/**/*.ts`/`*.tsx` under `libs/` and `apps/` excluding the integration-test mock server, integration-test harness, Storybook config, and e2e harness (see `vitest.config.ts` exclude list). Integration tests and Storybook interaction tests are complementary signals, not a substitute — line/branch coverage comes from unit tests only.

Concretely, when you add a new file:

- **Cloud function handler** (`libs/firebase/maple-functions/{name}/src/lib/`) — add a sibling `.spec.ts`. Mock the `createAdminFunction` / `createAuthenticatedFunction` wrapper to return the handler directly so you can invoke it as a plain function. Mock repositories + Square/Webflow services with `vi.mock()` per ADR-017. Test each branch: happy path, not-found / permission rejections, service-side errors. See `libs/firebase/maple-functions/create-invoice/src/lib/create-invoice.spec.ts` and `.../update-invoice.spec.ts`.
- **Firestore trigger** — export the inner handler so the spec can invoke it directly; mock `onDocumentWritten` to return the handler. See `libs/firebase/maple-functions/sync-invoice-to-square/src/lib/sync-invoice-to-square.spec.ts` for the pattern (draft→sent happy path, each guard, status-transition no-ops, Timestamp/string coercion branches).
- **HTTPS endpoint** — mock `onRequest` similarly; exercise signature verification, method rejection, event dispatch, and the catch-all error path. See `libs/firebase/maple-functions/square-webhook/src/lib/square-webhook.spec.ts` (endpoint describe block).
- **Repository method** — add a spec in `libs/firebase/database/src/lib/{entity}.repository.spec.ts`. Mock `./utilities/database.config`. See `invoice.repository.spec.ts` and `registration.repository.spec.ts` for the mock-chain pattern.
- **Square / Webflow service method** — add a sibling spec mocking the SDK client at the method level. See `libs/firebase/square/src/lib/invoices.service.spec.ts`.
- **New lib with tests** — also add the lib's `vitest.config.ts` to `vitest.workspace.ts`, otherwise the merged coverage report won't include it.

If you're adding a new large handler to an existing test-covered file (like `square-webhook.ts`), **export the handler** so the spec can target it directly rather than going through the HTTPS endpoint wrapper for every branch.
