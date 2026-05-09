---
globs:
  - "libs/react/**"
  - "apps/maple-spruce/src/components/**"
  - "apps/maple-spruce/src/hooks/**"
---

# React Component Rules

## Brand Typography

The admin React app mirrors the live Webflow type system. Do not substitute `system-ui`, `Inter`, `Roboto`, or `Lora` — those are not the brand fonts.

| Role | Stack | Source |
|------|-------|--------|
| Body / heading | `Georgia, Times, "Times New Roman", serif` | `fonts.body` / `fonts.heading` |
| Button | `Archivo, system-ui, -apple-system, sans-serif` | `fonts.button` |
| Mono (codes, IDs) | `ui-monospace, SFMono-Regular, Menlo, Monaco, monospace` | `fonts.mono` |

Import from `@maple/react/theme`:

```typescript
import { fonts } from '@maple/react/theme';
// Inline overrides only when MUI's theme can't reach the element (e.g. native <button>).
<button style={{ fontFamily: fonts.button }}>Pay</button>
```

The MUI theme already wires headings and `MuiButton` to the right stacks — most components need no overrides at all. Apple Pay buttons are the documented exception (HIG requires the system font).

See `docs/reference/webflow-design-system.md` for the canonical Webflow values.

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
