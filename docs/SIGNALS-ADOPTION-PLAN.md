# Preact Signals Adoption Plan for Maple & Spruce

> Investigating signals-based state management inspired by Mountain Sol's Angular signals pattern

## Executive Summary

Mountain Sol is adopting Angular signals to simplify state management, ensure correctness, and enable easier evolution. This document evaluates **Preact Signals** (`@preact/signals-react`) as the equivalent pattern for Maple & Spruce's React/Next.js stack.

**Recommendation**: Adopt Preact Signals incrementally for new features, starting with form state management. The pattern aligns well with Mountain Sol's approach and offers significant benefits for complex forms and derived state.

---

## 1. Mountain Sol's Angular Signals Pattern

### Key Patterns Observed

| Pattern | Purpose | Example |
|---------|---------|---------|
| `signal<T>()` | Writable reactive state | Form fields, UI state |
| `computed()` | Derived state with auto-tracking | Validation results, formatted displays |
| `effect()` | Side effects on signal changes | URL sync, form population |
| `rxResource()` | Async data with resource lifecycle | API data loading |
| `rxMethod()` | Event handlers with RxJS | Form submission, dialog results |

### Benefits They're Seeing

1. **Automatic dependency tracking** - No manual dependency arrays
2. **Fine-grained reactivity** - Only affected UI updates
3. **Simpler mental model** - State flows naturally
4. **Type-safe derived state** - `computed()` always reflects current values
5. **Cleaner validation** - Vest integration with signals works elegantly

### Example: Form Validation Pattern

```typescript
// Mountain Sol pattern (Angular)
readonly #validation = computed(() => {
  return classValidationSuite({
    semesterId: this.semesterId(),
    name: this.name(),
    // ... other fields automatically tracked
  });
});

readonly errors = computed(() => {
  return this.showValidationErrors()
    ? this.#validation().getErrors()
    : {};
});

readonly isValid = computed(() => this.#validation().isValid());
```

---

## 2. Preact Signals for React

### Package: `@preact/signals-react`

**Core API** (identical concepts to Angular signals):

| API | Purpose | React Equivalent |
|-----|---------|------------------|
| `signal(value)` | Writable state | `useState` |
| `computed(fn)` | Derived state | `useMemo` |
| `effect(fn)` | Side effects | `useEffect` |
| `batch(fn)` | Group updates | React 18 auto-batching |

### React 19 Compatibility

**Status**: ✅ Supported (as of late 2024)

The [GitHub issue #566](https://github.com/preactjs/signals/issues/566) confirms React 19 works with signals. For React Compiler compatibility:

```javascript
// babel.config.js
{
  plugins: [
    "babel-plugin-react-compiler",           // React compiler first
    "module:@preact/signals-react-transform" // Signals transform second
  ]
}
```

### Installation

```bash
npm install @preact/signals-react
npm install -D @preact/signals-react-transform  # Optional: Babel transform
```

---

## 3. Current M&S State Management

### Existing Patterns

| Pattern | Location | Notes |
|---------|----------|-------|
| `RequestState<T>` | `libs/ts/domain/` | Discriminated unions (excellent) |
| Data hooks | `libs/react/data/` | `useProducts`, `useArtists`, etc. |
| Form state | Component-local | `useState` + manual updates |
| Derived state | `useMemo` | Manual dependency arrays |

### Current Limitations

1. **Manual dependency tracking** - Easy to miss dependencies in `useMemo`/`useEffect`
2. **Form state boilerplate** - Each field needs `useState` + `setFormData` callback
3. **Validation coupling** - Must manually trigger validation on changes
4. **No fine-grained updates** - Component re-renders on any state change

### Example: Current Form Pattern

```typescript
// Current M&S pattern
const [formData, setFormData] = useState<FormState>(defaultFormState);
const [errors, setErrors] = useState<Record<string, string>>({});

const handleChange = (field: keyof FormState, value: string | number) => {
  setFormData((prev) => ({ ...prev, [field]: value }));
  if (errors[field]) {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }
};

// Validation must be called explicitly
const validationErrors = validateForm(formData);
```

---

## 4. Proposed Signals Pattern for M&S

### Form State with Signals

```typescript
// Proposed M&S pattern with signals
import { signal, computed, effect } from '@preact/signals-react';

// Form signals (each field reactive independently)
const artistId = signal('');
const name = signal('');
const description = signal('');
const priceDollars = signal(0);
const quantity = signal(0);
const status = signal<ProductStatus>('active');
const commissionPercent = signal(0);

// Validation runs automatically when any field changes
const validation = computed(() => {
  return productValidationSuite({
    artistId: artistId.value,
    name: name.value,
    description: description.value,
    priceCents: priceDollars.value * 100,
    quantity: quantity.value,
    status: status.value,
    commissionRate: commissionPercent.value / 100,
  });
});

// Derived state - always current
const errors = computed(() => validation.value.getErrors());
const isValid = computed(() => validation.value.isValid());
const hasChanges = computed(() => {
  // Compare against initial values
  return name.value !== initialProduct?.name ||
         priceDollars.value !== (initialProduct?.priceCents ?? 0) / 100;
});
```

### Data Fetching with Signals

```typescript
// Combine with existing RequestState pattern
const productsState = signal<RequestState<Product[]>>({ status: 'idle' });

// Derived loading/error states
const isLoading = computed(() => productsState.value.status === 'loading');
const products = computed(() =>
  productsState.value.status === 'success'
    ? productsState.value.data
    : []
);

// Effect for side effects
effect(() => {
  if (productsState.value.status === 'success') {
    console.log(`Loaded ${products.value.length} products`);
  }
});
```

### Component Integration

```tsx
// Direct signal binding (fine-grained updates)
function ProductNameField() {
  return (
    <TextField
      value={name.value}
      onChange={(e) => name.value = e.target.value}
      error={!!errors.value.name}
      helperText={errors.value.name?.[0]}
    />
  );
}

// Or pass signal directly for optimal performance
function ProductNameDisplay() {
  return <Typography>{name}</Typography>; // Auto-updates without re-render
}
```

---

## 5. Adoption Strategy

### Phase 1: Foundation (Low Risk)

**Create signals utility library:**

```
libs/react/signals/
├── src/lib/
│   ├── index.ts           # Re-export @preact/signals-react
│   ├── form-signals.ts    # useFormSignals hook
│   └── request-signals.ts # Signal-based RequestState helpers
└── project.json
```

**Deliverables:**
- Wrapper library with project-specific utilities
- TypeScript types for signal-based forms
- Documentation and examples

### Phase 2: Pilot (Single Feature)

**Refactor ProductForm to use signals:**

| Before | After |
|--------|-------|
| 8+ `useState` calls | Signal per field |
| Manual validation trigger | `computed` validation |
| Explicit error clearing | Automatic via signals |
| `useMemo` for derived state | `computed` signals |

**Success Criteria:**
- Fewer lines of code
- Validation always current
- Easier to add new fields
- No regression in functionality

### Phase 3: Expand

**Apply to other forms:**
- ArtistForm
- CategoryForm
- Future: Etsy integration forms, payout configuration

**Apply to complex derived state:**
- Product filtering (currently in `useMemo`)
- Artist/category lookups
- Dashboard statistics

### Phase 4: Evaluate & Decide

After piloting, evaluate:

| Metric | Target |
|--------|--------|
| Code reduction | 20-30% fewer LOC in forms |
| Bug reduction | Fewer stale state issues |
| Developer experience | Team finds it easier |
| Performance | No regression, potential improvement |

---

## 6. Technical Considerations

### Next.js App Router Compatibility

Signals work with Next.js 13+ App Router. Use the Babel transform or `useSignals` hook:

```tsx
'use client';

import { useSignals } from '@preact/signals-react/runtime';

export function ProductForm() {
  useSignals(); // Enable signal tracking in this component
  // ... rest of component
}
```

### Server Components

Signals are **client-only**. Server Components cannot use signals directly. This aligns with current M&S architecture where data fetching happens client-side via Cloud Functions.

### Testing

Signals are easy to test in isolation:

```typescript
import { signal, computed } from '@preact/signals-react';

test('validation updates when field changes', () => {
  const name = signal('');
  const errors = computed(() => validateName(name.value));

  expect(errors.value).toContain('Name is required');

  name.value = 'Valid Name';
  expect(errors.value).toHaveLength(0);
});
```

### DevTools

The [Preact DevTools extension](https://preactjs.github.io/preact-devtools/) supports signals inspection. Not as mature as Redux DevTools but sufficient for debugging.

---

## 7. Comparison: Signals vs Alternatives

| Feature | Preact Signals | React State | Zustand | Jotai |
|---------|---------------|-------------|---------|-------|
| Fine-grained reactivity | ✅ | ❌ | ❌ | ✅ |
| Automatic dependency tracking | ✅ | ❌ | ❌ | ✅ |
| No provider required | ✅ | ✅ | ✅ | ❌ |
| Mountain Sol pattern match | ✅ | ❌ | ❌ | Partial |
| Bundle size | ~2KB | 0 | ~1KB | ~3KB |
| React 19 compatible | ✅ | ✅ | ✅ | ✅ |
| SSR support | ✅ | ✅ | ✅ | ✅ |

**Why Signals over Jotai/Zustand:**
- Closest match to Mountain Sol's Angular signals
- True fine-grained reactivity (Zustand doesn't have this)
- Simpler mental model than Jotai's atom composition
- Direct API mapping for knowledge sharing across projects

---

## 8. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| React internals patching | Medium | High | Use `@preact-signals/safe-react` if issues arise |
| Team learning curve | Low | Medium | Comprehensive docs, pair programming |
| Future React compatibility | Low | Medium | Community actively maintains; signals pattern is industry-wide |
| Performance regression | Very Low | Medium | Benchmark before/after; signals typically faster |

### Alternative Package

If React internal patching causes issues, consider [`@preact-signals/safe-react`](https://www.npmjs.com/package/@preact-signals/safe-react) which achieves the same API without patching React internals.

---

## 9. Implementation Checklist

### Immediate (This Week)

- [ ] Create ADR documenting decision to adopt signals
- [ ] Create `libs/react/signals/` library
- [ ] Install `@preact/signals-react` and transform
- [ ] Configure Babel/SWC for signals transform
- [ ] Write basic documentation with examples

### Short-term (Next Sprint)

- [ ] Refactor `ProductForm` to use signals
- [ ] Add Vest integration with `computed` validation
- [ ] Write unit tests for signal-based form
- [ ] Compare LOC and complexity before/after

### Medium-term (Following Sprints)

- [ ] Apply pattern to `ArtistForm`, `CategoryForm`
- [ ] Evaluate for data hooks (`useProducts`, etc.)
- [ ] Document patterns in PATTERNS-AND-PRACTICES.md
- [ ] Consider signals for Etsy integration forms

---

## 10. Example: Full ProductForm Refactor

### Before (Current)

```typescript
// ~150 lines, 8 useState calls, manual validation
export function ProductForm({ product, onSubmit, onClose }) {
  const [formData, setFormData] = useState<FormState>(getDefaultState(product));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  // ... more state

  const handleChange = (field: keyof FormState, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => { /* clear error */ });
    }
  };

  const handleSubmit = () => {
    const validationErrors = validateForm(formData);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    // ... submit
  };
}
```

### After (With Signals)

```typescript
// ~100 lines, cleaner validation, automatic updates
import { signal, computed, effect } from '@preact/signals-react';
import { useSignals } from '@preact/signals-react/runtime';

export function ProductForm({ product, onSubmit, onClose }) {
  useSignals();

  // Form state as signals
  const artistId = signal(product?.artistId ?? '');
  const name = signal(product?.name ?? '');
  const priceDollars = signal((product?.priceCents ?? 0) / 100);
  // ... other fields

  // Validation automatically tracks all field signals
  const validation = computed(() => productValidationSuite({
    artistId: artistId.value,
    name: name.value,
    priceCents: Math.round(priceDollars.value * 100),
    // ... other fields
  }));

  const errors = computed(() => validation.value.getErrors());
  const isValid = computed(() => validation.value.isValid());

  const handleSubmit = () => {
    if (!isValid.value) return;
    onSubmit(/* convert signals to input */);
  };

  return (
    <TextField
      value={name.value}
      onChange={(e) => name.value = e.target.value}
      error={!!errors.value.name}
      helperText={errors.value.name?.[0]}
    />
    // ... rest of form
  );
}
```

---

## References

- [Preact Signals Guide](https://preactjs.com/guide/v10/signals/)
- [Preact Signals GitHub](https://github.com/preactjs/signals)
- [@preact/signals-react npm](https://www.npmjs.com/package/@preact/signals-react)
- [React 19 Support Issue](https://github.com/preactjs/signals/issues/566)
- [@preact-signals/safe-react](https://www.npmjs.com/package/@preact-signals/safe-react) (alternative)
- [Mountain Sol Platform](https://github.com/MountainSOLSchool/platform) (Angular signals reference)

---

## Decision

**Proceed with incremental adoption.** Start with `libs/react/signals/` library and pilot on `ProductForm`. Evaluate after pilot before broader adoption.

*Document created: January 2025*
