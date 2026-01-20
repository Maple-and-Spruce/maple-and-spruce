# Signals Migration Guide

> Step-by-step patterns for migrating from React hooks to Preact Signals

This guide provides practical migration patterns with before/after examples for common scenarios in the Maple & Spruce codebase.

---

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [Core Concepts](#core-concepts)
3. [Migration Patterns](#migration-patterns)
   - [Pattern 1: Simple State](#pattern-1-simple-state)
   - [Pattern 2: Form Fields](#pattern-2-form-fields)
   - [Pattern 3: Derived State](#pattern-3-derived-state)
   - [Pattern 4: Validation with Vest](#pattern-4-validation-with-vest)
   - [Pattern 5: Side Effects](#pattern-5-side-effects)
   - [Pattern 6: Async Data (RequestState)](#pattern-6-async-data-requeststate)
   - [Pattern 7: Component Props](#pattern-7-component-props)
4. [Form Migration Checklist](#form-migration-checklist)
5. [Common Pitfalls](#common-pitfalls)
6. [Testing Signals](#testing-signals)

---

## Quick Reference

| React Pattern | Signals Equivalent | Notes |
|--------------|-------------------|-------|
| `useState(value)` | `signal(value)` | Access via `.value` |
| `useMemo(() => derived, [deps])` | `computed(() => derived)` | Auto-tracks dependencies |
| `useEffect(() => {...}, [deps])` | `effect(() => {...})` | Auto-tracks, returns cleanup |
| `useCallback(fn, [deps])` | Just use `fn` | Signals are stable references |
| `setState(prev => newVal)` | `sig.value = newVal` | Or use `batch()` for multiple |

### Import Patterns

```typescript
// For component-scoped signals (most common)
import { useSignal, useComputed, useSignalEffect } from '@preact/signals-react';

// For module-level/shared signals
import { signal, computed, effect, batch } from '@preact/signals-react';

// Always needed in component body (unless using Babel transform)
import { useSignals } from '@preact/signals-react/runtime';
```

---

## Core Concepts

### Signals are Reactive Containers

A signal wraps a value. Reading `.value` creates a subscription; writing to `.value` notifies subscribers.

```typescript
const count = signal(0);

// Reading creates subscription
console.log(count.value); // 0

// Writing notifies all subscribers
count.value = 1;
```

### Computed Signals Track Dependencies Automatically

```typescript
const firstName = signal('John');
const lastName = signal('Doe');

// Automatically re-evaluates when firstName OR lastName changes
const fullName = computed(() => `${firstName.value} ${lastName.value}`);
```

### Effects Run on Dependency Changes

```typescript
const searchQuery = signal('');

// Runs whenever searchQuery changes
effect(() => {
  console.log('Searching for:', searchQuery.value);
});
```

---

## Migration Patterns

### Pattern 1: Simple State

**Before (React hooks):**
```typescript
const [count, setCount] = useState(0);
const [name, setName] = useState('');

const handleIncrement = () => setCount(prev => prev + 1);
const handleNameChange = (e) => setName(e.target.value);
```

**After (Signals):**
```typescript
const count = useSignal(0);
const name = useSignal('');

const handleIncrement = () => count.value++;
const handleNameChange = (e) => name.value = e.target.value;
```

**Key differences:**
- No setter function needed - mutate `.value` directly
- No need for functional updates (`prev => prev + 1`) - just increment
- `useSignal` creates a component-scoped signal (like useState)

---

### Pattern 2: Form Fields

**Before (Current ProductForm pattern):**
```typescript
interface FormState {
  name: string;
  priceDollars: number;
  quantity: number;
  status: ProductStatus;
}

const [formData, setFormData] = useState<FormState>(defaultFormState);

const handleChange = (field: keyof FormState, value: string | number) => {
  setFormData((prev) => ({
    ...prev,
    [field]: value,
  }));
};

// Usage
<TextField
  value={formData.name}
  onChange={(e) => handleChange('name', e.target.value)}
/>
```

**After (Signals):**
```typescript
// Each field is its own signal - fine-grained updates
const name = useSignal('');
const priceDollars = useSignal(0);
const quantity = useSignal(1);
const status = useSignal<ProductStatus>('active');

// No handleChange wrapper needed - update directly
<TextField
  value={name.value}
  onChange={(e) => name.value = e.target.value}
/>
```

**Benefits:**
- Changing `name` doesn't re-render price/quantity fields
- No object spread on every keystroke
- Simpler mental model - each field is independent

---

### Pattern 3: Derived State

**Before (useMemo):**
```typescript
const [artistsState, setArtistsState] = useState<RequestState<Artist[]>>({ status: 'idle' });

// Must manually specify dependencies
const artistMap = useMemo(() => {
  if (artistsState.status !== 'success') return new Map();
  return new Map(artistsState.data.map((a) => [a.id, a]));
}, [artistsState]);

const activeArtists = useMemo(() => {
  if (artistsState.status !== 'success') return [];
  return artistsState.data.filter(a => a.status === 'active');
}, [artistsState]);
```

**After (computed):**
```typescript
const artistsState = useSignal<RequestState<Artist[]>>({ status: 'idle' });

// Dependencies tracked automatically!
const artistMap = useComputed(() => {
  if (artistsState.value.status !== 'success') return new Map();
  return new Map(artistsState.value.data.map((a) => [a.id, a]));
});

const activeArtists = useComputed(() => {
  if (artistsState.value.status !== 'success') return [];
  return artistsState.value.data.filter(a => a.status === 'active');
});
```

**Benefits:**
- No dependency arrays to maintain
- Can't forget a dependency
- Computed values are lazy (only calculate when accessed)

---

### Pattern 4: Validation with Vest

This is the biggest win - validation that's always current.

**Before (Manual validation):**
```typescript
const [formData, setFormData] = useState<FormState>(defaultFormState);
const [errors, setErrors] = useState<Record<string, string>>({});

const handleChange = (field: keyof FormState, value: string | number) => {
  setFormData((prev) => ({ ...prev, [field]: value }));
  // Must manually clear errors
  if (errors[field]) {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }
};

const handleSubmit = () => {
  // Validation only runs on submit
  const validationErrors = validateForm(formData);
  if (Object.keys(validationErrors).length > 0) {
    setErrors(validationErrors);
    return;
  }
  // ... submit
};
```

**After (Signals + Vest):**
```typescript
import { productValidation } from '@maple/ts/validation';

// Form field signals
const artistId = useSignal('');
const name = useSignal('');
const priceDollars = useSignal(0);
const quantity = useSignal(1);
const status = useSignal<ProductStatus>('active');

// Show validation errors only after first submit attempt
const showValidationErrors = useSignal(false);

// Validation runs automatically when ANY field changes
const validation = useComputed(() => {
  return productValidation({
    artistId: artistId.value,
    name: name.value,
    priceCents: Math.round(priceDollars.value * 100),
    quantity: quantity.value,
    status: status.value,
  });
});

// Derived validation state
const errors = useComputed(() => {
  if (!showValidationErrors.value) return {};
  return validation.value.getErrors();
});

const isValid = useComputed(() => validation.value.isValid());

// Field-level error helper
const getFieldError = (field: string) => {
  const fieldErrors = errors.value[field];
  return fieldErrors?.[0] ?? null;
};

const handleSubmit = () => {
  showValidationErrors.value = true;
  if (!isValid.value) return;
  // ... submit
};

// Usage - errors update automatically as user types
<TextField
  value={name.value}
  onChange={(e) => name.value = e.target.value}
  error={!!getFieldError('name')}
  helperText={getFieldError('name')}
/>
```

**Benefits:**
- Validation is always current - no stale state
- No manual error clearing needed
- `isValid` is always accurate
- Show/hide errors is a simple boolean toggle

---

### Pattern 5: Side Effects

**Before (useEffect):**
```typescript
const [product, setProduct] = useState<Product | null>(null);
const [formData, setFormData] = useState<FormState>(defaultFormState);

// Populate form when product changes
useEffect(() => {
  if (product) {
    setFormData({
      name: product.squareCache.name,
      priceDollars: product.squareCache.priceCents / 100,
      quantity: product.squareCache.quantity,
      status: product.status,
    });
  }
}, [product]);
```

**After (effect):**
```typescript
const product = useSignal<Product | null>(null);
const name = useSignal('');
const priceDollars = useSignal(0);
const quantity = useSignal(1);
const status = useSignal<ProductStatus>('active');

// Populate form when product changes - dependencies auto-tracked
useSignalEffect(() => {
  const p = product.value;
  if (p) {
    // Batch to prevent multiple re-renders
    batch(() => {
      name.value = p.squareCache.name;
      priceDollars.value = p.squareCache.priceCents / 100;
      quantity.value = p.squareCache.quantity;
      status.value = p.status;
    });
  }
});
```

**With cleanup:**
```typescript
useSignalEffect(() => {
  const query = searchQuery.value;
  const controller = new AbortController();

  fetch(`/api/search?q=${query}`, { signal: controller.signal })
    .then(res => res.json())
    .then(data => results.value = data);

  // Cleanup function - runs before next effect
  return () => controller.abort();
});
```

---

### Pattern 6: Async Data (RequestState)

**Before (Current useProducts pattern):**
```typescript
export function useProducts() {
  const [productsState, setProductsState] = useState<RequestState<Product[]>>({
    status: 'idle',
  });

  const fetchProducts = useCallback(async () => {
    setProductsState({ status: 'loading' });
    try {
      const result = await getProducts({});
      setProductsState({ status: 'success', data: result.data.products });
    } catch (error) {
      setProductsState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed',
      });
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  return { productsState, fetchProducts };
}
```

**After (Signals):**
```typescript
export function useProducts() {
  const productsState = useSignal<RequestState<Product[]>>({ status: 'idle' });

  // Derived state - no manual dependency tracking
  const isLoading = useComputed(() => productsState.value.status === 'loading');
  const products = useComputed(() =>
    productsState.value.status === 'success' ? productsState.value.data : []
  );
  const error = useComputed(() =>
    productsState.value.status === 'error' ? productsState.value.error : null
  );

  const fetchProducts = async () => {
    productsState.value = { status: 'loading' };
    try {
      const result = await getProducts({});
      productsState.value = { status: 'success', data: result.data.products };
    } catch (err) {
      productsState.value = {
        status: 'error',
        error: err instanceof Error ? err.message : 'Failed',
      };
    }
  };

  // Fetch on mount
  useSignalEffect(() => {
    fetchProducts();
  });

  return { productsState, isLoading, products, error, fetchProducts };
}
```

**Benefits:**
- Derived states (`isLoading`, `products`, `error`) always correct
- No `useCallback` needed - `fetchProducts` is stable
- Cleaner consumer code - can use `products.value` directly

---

### Pattern 7: Component Props

Signals can be passed as props for fine-grained updates.

**Option A: Pass signal directly (best performance)**
```typescript
// Parent
const name = useSignal('');

<NameField name={name} error={getFieldError('name')} />

// Child - updates without parent re-render
function NameField({ name, error }: { name: Signal<string>; error: string | null }) {
  return (
    <TextField
      value={name.value}
      onChange={(e) => name.value = e.target.value}
      error={!!error}
      helperText={error}
    />
  );
}
```

**Option B: Read value in parent (simpler, more re-renders)**
```typescript
// Parent
const name = useSignal('');

<NameField
  value={name.value}
  onChange={(v) => name.value = v}
  error={getFieldError('name')}
/>

// Child - standard React component
function NameField({ value, onChange, error }: NameFieldProps) {
  return (
    <TextField
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={!!error}
      helperText={error}
    />
  );
}
```

**Recommendation:** Start with Option B for compatibility with existing components, migrate to Option A for performance-critical paths.

---

## Form Migration Checklist

When migrating a form component to signals:

### 1. Identify State
- [ ] List all `useState` calls
- [ ] Identify which are form fields vs UI state (loading, errors, etc.)
- [ ] Identify `useMemo` dependencies that should become `computed`

### 2. Convert State to Signals
- [ ] Replace `useState` with `useSignal` for form fields
- [ ] Replace `useMemo` with `useComputed` for derived values
- [ ] Replace `useEffect` with `useSignalEffect` for side effects

### 3. Integrate Validation
- [ ] Create `validation` computed that calls Vest suite
- [ ] Create `errors` computed that respects `showValidationErrors`
- [ ] Create `isValid` computed for submit button state

### 4. Simplify Handlers
- [ ] Remove `handleChange` wrapper - update signals directly
- [ ] Remove error clearing logic - handled by computed
- [ ] Update submit handler to set `showValidationErrors.value = true`

### 5. Update JSX
- [ ] Change `value={formData.field}` to `value={field.value}`
- [ ] Change `onChange` to update signal directly
- [ ] Update error display to use computed errors

---

## Common Pitfalls

### 1. Forgetting `.value`

```typescript
// WRONG - comparing signal object, not value
if (count === 0) { ... }

// CORRECT
if (count.value === 0) { ... }
```

### 2. Destructuring Breaks Reactivity

```typescript
// WRONG - loses reactivity
const { value } = mySignal;
console.log(value); // Static, won't update

// CORRECT
console.log(mySignal.value); // Reactive
```

### 3. Creating Signals in Render

```typescript
// WRONG - creates new signal every render
function Component() {
  const count = signal(0); // Bad!
  return <div>{count.value}</div>;
}

// CORRECT - use hook for component-scoped signals
function Component() {
  const count = useSignal(0); // Good!
  return <div>{count.value}</div>;
}
```

### 4. Not Using Batch for Multiple Updates

```typescript
// WRONG - causes multiple re-renders
name.value = 'John';
email.value = 'john@example.com';
phone.value = '555-1234';

// CORRECT - single re-render
batch(() => {
  name.value = 'John';
  email.value = 'john@example.com';
  phone.value = '555-1234';
});
```

### 5. Mixing Signals and Regular State

```typescript
// AVOID - confusing mental model
const [count, setCount] = useState(0);
const doubled = useComputed(() => count * 2); // Won't work!

// CORRECT - use signals consistently
const count = useSignal(0);
const doubled = useComputed(() => count.value * 2);
```

---

## Testing Signals

Signals are easy to test because they're just values.

### Unit Testing Validation Logic

```typescript
import { describe, it, expect } from 'vitest';
import { signal, computed } from '@preact/signals-react';
import { productValidation } from '@maple/ts/validation';

describe('product form validation', () => {
  it('validates required fields', () => {
    const name = signal('');
    const artistId = signal('');

    const validation = computed(() => productValidation({
      name: name.value,
      artistId: artistId.value,
    }));

    expect(validation.value.hasErrors('name')).toBe(true);
    expect(validation.value.hasErrors('artistId')).toBe(true);

    // Fix errors
    name.value = 'Test Product';
    artistId.value = 'artist-123';

    expect(validation.value.hasErrors('name')).toBe(false);
    expect(validation.value.hasErrors('artistId')).toBe(false);
  });

  it('updates derived isValid when fields change', () => {
    const name = signal('');
    const validation = computed(() => productValidation({ name: name.value }));
    const isValid = computed(() => validation.value.isValid());

    expect(isValid.value).toBe(false);

    name.value = 'Valid Name';

    expect(isValid.value).toBe(true);
  });
});
```

### Component Testing with Signals

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { ProductFormSignals } from './ProductFormSignals';

describe('ProductFormSignals', () => {
  it('shows validation errors after submit attempt', async () => {
    render(<ProductFormSignals onSubmit={vi.fn()} onClose={vi.fn()} />);

    // Initially no errors shown
    expect(screen.queryByText('Name is required')).not.toBeInTheDocument();

    // Submit with empty form
    fireEvent.click(screen.getByText('Add'));

    // Now errors visible
    expect(screen.getByText('Name is required')).toBeInTheDocument();
  });

  it('clears errors as user types', async () => {
    render(<ProductFormSignals onSubmit={vi.fn()} onClose={vi.fn()} />);

    // Trigger errors
    fireEvent.click(screen.getByText('Add'));
    expect(screen.getByText('Name is required')).toBeInTheDocument();

    // Type in field
    fireEvent.change(screen.getByLabelText('Product Name'), {
      target: { value: 'My Product' }
    });

    // Error clears automatically
    expect(screen.queryByText('Name is required')).not.toBeInTheDocument();
  });
});
```

### Storybook Interaction Tests for Dialog Components

When testing dialog/modal components with play functions, use these patterns:

```typescript
import { fn, expect, within, userEvent, waitFor } from 'storybook/test';

/**
 * For dialogs that render in portals (like MUI Dialog),
 * query document.body instead of canvasElement
 */
const getDialogCanvas = () => within(document.body);

/**
 * Wait for dialog AND form content to be fully rendered.
 * This is critical for signals-based components.
 */
const waitForDialog = async () => {
  const canvas = getDialogCanvas();
  await waitFor(() => {
    expect(canvas.getByRole('dialog')).toBeInTheDocument();
    // Wait for a form field to ensure content rendered
    expect(canvas.getByLabelText(/email/i)).toBeInTheDocument();
  });
  return canvas;
};

export const ValidationTest: Story = {
  args: { open: true },
  play: async ({ args }) => {
    const canvas = await waitForDialog();

    // Use getByRole for MUI components instead of getByLabelText
    // MUI TextFields may not have proper label association
    await userEvent.type(
      canvas.getByRole('textbox', { name: /name/i }),
      'Test Value'
    );

    await userEvent.click(canvas.getByRole('button', { name: /submit/i }));

    await expect(args.onSubmit).toHaveBeenCalledTimes(1);
  },
};
```

**Key learnings:**

1. **MUI Dialogs use portals** - Query `document.body` not `canvasElement`
2. **Use `waitFor` with waitForDialog helper** - Ensures dialog content is rendered before interactions
3. **Prefer `getByRole` over `getByLabelText`** for MUI components - More reliable accessibility queries
4. **Test signals auto-updating** - Verify that typing in a field automatically clears validation errors

---

## Next Steps

1. **Read**: [SIGNALS-ADOPTION-PLAN.md](./SIGNALS-ADOPTION-PLAN.md) for the overall strategy
2. **Use**: `libs/react/signals/` for project utilities
3. **Start**: Migrate `ProductForm` as the pilot component
4. **Evaluate**: Compare code complexity and developer experience

---

*Last updated: January 2025*
