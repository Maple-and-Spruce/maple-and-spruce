---
globs:
  - "libs/react/**"
  - "apps/maple-spruce/src/components/**"
  - "apps/maple-spruce/src/hooks/**"
---

# React Component Rules

## MUI Theme Colors

Always use MUI theme tokens, not hardcoded hex values.

```typescript
// Good
<Button color="primary">Save</Button>

// Bad
<Button sx={{ backgroundColor: '#6B7B5E' }}>Save</Button>
```

Brand colors for reference (use through MUI theme only):
- Cream `#D5D6C8` - Backgrounds
- Dark Brown `#4A3728` - Headings
- Sage Green `#6B7B5E` - Primary/buttons
- Warm Gray `#7A7A6E` - Body text

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

## State Management

- Use Preact Signals for form state (see ADR-015)
- Use `RequestState<T>` for async state - never use boolean `isLoading`
- See `libs/ts/domain/src/lib/request-state.ts`

## Data Access

- All Firestore access goes through repositories (`libs/firebase/database/`)
- Never use raw `getDocs`/`setDoc` in components
- Use data hooks from `libs/react/data/`

## Validation

- Use Vest validation suites from `libs/ts/validation/`
- See `docs/architecture/PATTERNS-AND-PRACTICES.md` for patterns
