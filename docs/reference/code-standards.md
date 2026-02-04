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
