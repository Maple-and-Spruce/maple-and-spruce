# Mountain Sol Platform - Patterns Reference

> Detailed patterns from the Mountain Sol platform that serve as reference implementations for Maple & Spruce.
>
> **Source Repository**: https://github.com/MountainSOLSchool/platform

---

## Table of Contents

1. [Overview](#overview)
2. [Async State Pattern (Requested<T>)](#async-state-pattern-requestedt)
3. [Firebase Cloud Functions Architecture](#firebase-cloud-functions-architecture)
4. [Form Patterns](#form-patterns)
5. [Validation Patterns](#validation-patterns)
6. [State Management (React/Redux)](#state-management-reactredux)
7. [Multi-Step Workflows](#multi-step-workflows)
8. [CI/CD Patterns](#cicd-patterns)
9. [Library Structure](#library-structure)
10. [File Reference Index](#file-reference-index)

---

## Overview

The Mountain Sol platform is a mature Nx monorepo serving a school with:
- **Enrollment Portal** (Angular) - Class registration, payments, admin
- **Student Portal** (Next.js/React) - Student curriculum tracking
- **Cloud Functions** (45+) - Firebase backend

### Tech Stack Comparison

| Layer | Mountain Sol | Maple & Spruce |
|-------|--------------|----------------|
| Frontend | Angular 20 + React 19 | Next.js 15 + React 19 |
| UI | Angular Material + PrimeNG | MUI (Material) |
| State | Angular Signals + Redux | React hooks + Context |
| Database | Firebase Firestore | Firebase Firestore |
| Auth | Firebase Auth | Firebase Auth |
| Functions | Firebase Cloud Functions v2 | Firebase Cloud Functions |
| Monorepo | Nx | Nx |

---

## Async State Pattern (Requested<T>)

### The Problem
Boolean loading states (`isLoading`, `isError`) create impossible states and require multiple checks.

### The Solution
A discriminated union type that represents all possible async states.

### Source Files
- Type definition: [libs/angular/request/src/lib/models/requested.type.ts](https://github.com/MountainSOLSchool/platform/blob/main/libs/angular/request/src/lib/models/requested.type.ts)
- Utilities: [libs/angular/request/src/lib/utilities/requested.utility.ts](https://github.com/MountainSOLSchool/platform/blob/main/libs/angular/request/src/lib/utilities/requested.utility.ts)
- RxJS operators: [libs/angular/request/src/lib/utilities/requested-operators.utility.ts](https://github.com/MountainSOLSchool/platform/blob/main/libs/angular/request/src/lib/utilities/requested-operators.utility.ts)

### Implementation

```typescript
// SOL's Angular implementation
export class RequestState {
    static Empty = class Empty {};
    static Loading = class Loading {};
    static Error = class Error {};
}

export type Requested<T> =
    | T                                    // Loaded state (actual data)
    | typeof RequestState.Empty           // Not yet requested
    | typeof RequestState.Loading         // In progress
    | typeof RequestState.Error;          // Failed
```

### Adaptation for React (Maple & Spruce)

```typescript
// libs/ts/request/requested.type.ts
export type RequestState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string };

// Type guards
export const RequestedUtility = {
  isIdle: <T>(state: RequestState<T>): state is { status: 'idle' } =>
    state.status === 'idle',
  isLoading: <T>(state: RequestState<T>): state is { status: 'loading' } =>
    state.status === 'loading',
  isSuccess: <T>(state: RequestState<T>): state is { status: 'success'; data: T } =>
    state.status === 'success',
  isError: <T>(state: RequestState<T>): state is { status: 'error'; error: string } =>
    state.status === 'error',
};

// React hook
export function useAsync<T>(
  asyncFn: () => Promise<T>,
  deps: unknown[] = []
): RequestState<T> {
  const [state, setState] = useState<RequestState<T>>({ status: 'idle' });

  useEffect(() => {
    setState({ status: 'loading' });
    asyncFn()
      .then((data) => setState({ status: 'success', data }))
      .catch((error) => setState({ status: 'error', error: error.message }));
  }, deps);

  return state;
}
```

### Usage Pattern

```typescript
// Component usage
const artists = useAsync(() => ArtistRepository.findAll(), []);

// Render
{artists.status === 'loading' && <CircularProgress />}
{artists.status === 'error' && <Alert severity="error">{artists.error}</Alert>}
{artists.status === 'success' && <ArtistList artists={artists.data} />}
```

---

## Firebase Cloud Functions Architecture

### Library-Per-Function Pattern

SOL uses one Nx library per Cloud Function, enabling granular deployment.

### Source Files
- Function builder: [libs/firebase/functions/src/lib/utilities/functions.utility.ts](https://github.com/MountainSOLSchool/platform/blob/main/libs/firebase/functions/src/lib/utilities/functions.utility.ts)
- Auth utility: [libs/firebase/functions/src/lib/utilities/auth.utility.ts](https://github.com/MountainSOLSchool/platform/blob/main/libs/firebase/functions/src/lib/utilities/auth.utility.ts)
- Example function: [libs/firebase/enrollment-functions/create-class/src/lib/create-class.ts](https://github.com/MountainSOLSchool/platform/blob/main/libs/firebase/enrollment-functions/create-class/src/lib/create-class.ts)

### Directory Structure

```
libs/firebase/
├── functions/                    # Core utilities
│   └── src/lib/utilities/
│       ├── functions.utility.ts  # FunctionBuilder pattern
│       └── auth.utility.ts       # Role validation
├── database/                     # Firestore utilities
│   └── src/lib/utilities/
│       └── database.utility.ts
└── enrollment-functions/         # Individual function libraries
    ├── create-class/
    │   ├── src/
    │   │   ├── lib/create-class.ts
    │   │   └── index.ts
    │   └── project.json          # Nx config
    ├── update-class/
    ├── enroll/
    └── ... (45+ functions)
```

### FunctionBuilder Pattern

The fluent builder provides consistent structure across all functions:

```typescript
// SOL's FunctionBuilder pattern
export class Functions {
    public static endpoint = new FunctionBuilder();
}

// Usage examples:
// Simple function
export const getUnits = Functions.endpoint
    .handle<{ageGroup: string}>(async (request, response) => {
        const { ageGroup } = request.body.data;
        // ... implementation
        response.send({ units });
    });

// Admin-only function
export const createClass = Functions.endpoint
    .restrictedToRoles(Role.Admin)
    .handle<CreateClassRequest>(async (request, response) => {
        // ... implementation
    });

// Function with secrets
export const enroll = Functions.endpoint
    .usingSecrets(...Braintree.SECRET_NAMES)
    .usingStrings(...Braintree.STRING_NAMES)
    .handle<EnrollRequest>(async (request, response, secrets, strings) => {
        // ... implementation
    });
```

### Adaptation for Maple & Spruce

```typescript
// libs/firebase/functions/src/functions.utility.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';

export enum Role {
    Admin = 'admin',
}

export function createFunction<TReq, TRes>(
    handler: (data: TReq, context: { uid?: string }) => Promise<TRes>,
    options?: { requiredRole?: Role }
) {
    return onCall(async (request) => {
        // Auth check
        if (options?.requiredRole) {
            if (!request.auth?.uid) {
                throw new HttpsError('unauthenticated', 'Must be logged in');
            }
            const isAdmin = await checkRole(request.auth.uid, options.requiredRole);
            if (!isAdmin) {
                throw new HttpsError('permission-denied', 'Insufficient permissions');
            }
        }

        return handler(request.data as TReq, { uid: request.auth?.uid });
    });
}

async function checkRole(uid: string, role: Role): Promise<boolean> {
    const db = getFirestore();
    const doc = await db.collection('admins').doc(uid).get();
    return doc.exists;
}

// Usage
export const createArtist = createFunction<CreateArtistRequest, Artist>(
    async (data, context) => {
        // Implementation
    },
    { requiredRole: Role.Admin }
);
```

---

## Form Patterns

### Form State Machine

SOL uses a discriminated union for form submission state.

### Source Files
- Class form: [libs/angular/classes/class-management/src/lib/components/class-form/class-form.component.ts](https://github.com/MountainSOLSchool/platform/blob/main/libs/angular/classes/class-management/src/lib/components/class-form/class-form.component.ts) (lines 89-94)

### Pattern

```typescript
// Form state type
type FormState = { message?: string } & (
    | { status: 'idle' }
    | { status: 'submitting' }
    | { status: 'success'; classId: string }
    | { status: 'error'; message: string }
);

// React adaptation
const [formState, setFormState] = useState<FormState>({ status: 'idle' });

const handleSubmit = async (data: FormData) => {
    setFormState({ status: 'submitting' });
    try {
        const result = await ArtistRepository.create(data);
        setFormState({ status: 'success', classId: result.id });
    } catch (error) {
        setFormState({ status: 'error', message: error.message });
    }
};

// Render
<Button disabled={formState.status === 'submitting'}>
    {formState.status === 'submitting' ? 'Saving...' : 'Save'}
</Button>
{formState.status === 'error' && <Alert severity="error">{formState.message}</Alert>}
{formState.status === 'success' && <Alert severity="success">Saved!</Alert>}
```

### Draft vs. Publish Pattern

SOL allows saving drafts with partial data, only enforcing validation on publish.

```typescript
// Validation only when publishing
const canSubmit = computed(() => {
    if (!live()) {
        return true; // Draft mode - always allow save
    }
    return validationResult().isValid(); // Publish mode - must validate
});
```

---

## Validation Patterns

### Vest Validation Framework

SOL uses [Vest](https://vestjs.dev/) for declarative validation with suite definitions.

### Source Files
- Validation suite: [libs/ts/classes/classes-domain/src/lib/validation/class-validation.suite.ts](https://github.com/MountainSOLSchool/platform/blob/main/libs/ts/classes/classes-domain/src/lib/validation/class-validation.suite.ts)

### Pattern

```typescript
import { create, test, enforce, only } from 'vest';

export const artistValidation = create((data: Partial<Artist>, field?: string) => {
    only(field); // Only validate specific field if provided

    test('name', 'Name is required', () => {
        enforce(data.name).isNotBlank();
    });

    test('email', 'Email is required', () => {
        enforce(data.email).isNotBlank();
    });

    test('email', 'Email must be valid', () => {
        enforce(data.email).matches(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    });

    test('commissionRate', 'Commission rate must be between 0 and 1', () => {
        enforce(data.commissionRate).isBetween(0, 1);
    });
});

// Usage in component
const result = artistValidation(formData);
const errors = result.getErrors();
// { name: ['Name is required'], email: ['Email must be valid'] }
```

---

## State Management (React/Redux)

### Redux + Redux-Observable Pattern

SOL's student portal uses Redux Toolkit with epics for async operations.

### Source Files
- Store setup: [apps/student-portal/store/store.tsx](https://github.com/MountainSOLSchool/platform/blob/main/apps/student-portal/store/store.tsx)
- Slice example: [apps/student-portal/store/updateUnits/updateUnitsSlice.ts](https://github.com/MountainSOLSchool/platform/blob/main/apps/student-portal/store/updateUnits/updateUnitsSlice.ts)
- Epics: [apps/student-portal/store/updateUnits/updateUnitsEpics.ts](https://github.com/MountainSOLSchool/platform/blob/main/apps/student-portal/store/updateUnits/updateUnitsEpics.ts)

### Store Structure

```typescript
// Store configuration
const rootReducer = combineReducers({
    login: loginReducer,
    paths: pathsReducer,
    units: unitStore,
    student: student,
    updateUnits: updateUnits,
});

const epicMiddleware = createEpicMiddleware();

export const store = configureStore({
    reducer: rootReducer,
    middleware: () => new Tuple(epicMiddleware),
});

epicMiddleware.run(rootEpic);
```

### Slice Pattern with Requested<T>

```typescript
type State = {
    artists: Requested<Artist[]>;
    selectedArtistId: string | undefined;
    saveChanges: Requested<void>;
};

const initialState: State = {
    artists: RequestState.Empty,
    selectedArtistId: undefined,
    saveChanges: RequestState.Empty,
};

const artistsSlice = createSlice({
    name: 'artists',
    initialState,
    reducers: {
        loadArtists: (state) => {
            state.artists = RequestState.Loading;
        },
        artistsLoadSucceeded: (state, action: PayloadAction<Artist[]>) => {
            state.artists = action.payload;
        },
        artistsLoadFailed: (state) => {
            state.artists = RequestState.Error;
        },
        selectArtist: (state, action: PayloadAction<string>) => {
            state.selectedArtistId = action.payload;
        },
    },
});
```

### Epic Pattern

```typescript
const loadArtistsEpic: Epic = (action$, state$) =>
    action$.pipe(
        ofType(artistsSlice.actions.loadArtists.type),
        switchMap(() =>
            from(ArtistRepository.findAll()).pipe(
                map((artists) => artistsSlice.actions.artistsLoadSucceeded(artists)),
                catchError(() => of(artistsSlice.actions.artistsLoadFailed()))
            )
        )
    );
```

---

## Multi-Step Workflows

### Enrollment Workflow Pattern

SOL implements complex multi-step forms with draft saving.

### Source Files
- Workflow store: [libs/angular/classes/class-enrollment/src/lib/components/enrollment-workflow/enrollment-workflow.store.ts](https://github.com/MountainSOLSchool/platform/blob/main/libs/angular/classes/class-enrollment/src/lib/components/enrollment-workflow/enrollment-workflow.store.ts)
- Draft functions: [libs/firebase/enrollment-functions/update-enrollment-draft/src/lib/update-enrollment-draft.ts](https://github.com/MountainSOLSchool/platform/blob/main/libs/firebase/enrollment-functions/update-enrollment-draft/src/lib/update-enrollment-draft.ts)

### Key Features

1. **Step-based navigation** with validation per step
2. **Auto-save drafts** with 500ms debounce
3. **Firestore trigger cleanup** - auto-delete draft on success
4. **Cost calculation** - server-side basket calculation

### Draft Auto-Save Pattern

```typescript
// Debounced draft saving
useEffect(() => {
    const timer = setTimeout(() => {
        if (hasChanges) {
            saveDraft(currentState);
        }
    }, 500);
    return () => clearTimeout(timer);
}, [currentState, hasChanges]);

// Cleanup trigger (Firestore)
export const onSuccessfulEnrollDeleteDraft = onDocumentCreated(
    'enrollments/{enrollmentId}',
    async (event) => {
        const enrollment = event.data?.data();
        if (enrollment?.status === 'enrolled') {
            await db.collection('enrollment_draft').doc(enrollment.userId).delete();
        }
    }
);
```

---

## CI/CD Patterns

### Affected-Only Function Deployment

SOL deploys only changed functions using Nx affected detection.

### Source Files
- Workflow: [.github/workflows/firebase-functions-merge.yml](https://github.com/MountainSOLSchool/platform/blob/main/.github/workflows/firebase-functions-merge.yml)
- Build check: [.github/workflows/build-check.yml](https://github.com/MountainSOLSchool/platform/blob/main/.github/workflows/build-check.yml)

### Pattern

```yaml
# .github/workflows/firebase-functions-merge.yml
jobs:
  detect-affected:
    runs-on: ubuntu-latest
    outputs:
      functions: ${{ steps.affected.outputs.functions }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Detect affected functions
        id: affected
        run: |
          AFFECTED=$(npx nx affected:apps --base=origin/main~1 --plain | grep -E '^firebase-' || echo "")
          echo "functions=$AFFECTED" >> $GITHUB_OUTPUT

  deploy:
    needs: detect-affected
    if: needs.detect-affected.outputs.functions != ''
    strategy:
      matrix:
        function: ${{ fromJson(needs.detect-affected.outputs.functions) }}
    steps:
      - name: Deploy ${{ matrix.function }}
        run: firebase deploy --only functions:${{ matrix.function }}
```

---

## Library Structure

### Recommended Nx Library Organization

Based on SOL's structure, here's the recommended organization for Maple & Spruce:

```
libs/
├── ts/                              # Framework-agnostic TypeScript
│   ├── domain/                      # Domain models
│   │   ├── artist.ts
│   │   ├── product.ts
│   │   ├── sale.ts
│   │   ├── payout.ts
│   │   └── index.ts
│   ├── request/                     # Async state utilities
│   │   ├── requested.type.ts
│   │   ├── requested.utility.ts
│   │   └── index.ts
│   ├── validation/                  # Vest validation suites
│   │   ├── artist.validation.ts
│   │   ├── product.validation.ts
│   │   └── index.ts
│   └── firebase/
│       └── api-types/               # Function request/response types
│           ├── artist.types.ts
│           ├── product.types.ts
│           └── index.ts
├── firebase/
│   ├── functions/                   # Core function utilities
│   │   ├── functions.utility.ts
│   │   ├── auth.utility.ts
│   │   └── index.ts
│   ├── database/                    # Firestore repositories
│   │   ├── artist.repository.ts
│   │   ├── product.repository.ts
│   │   ├── sale.repository.ts
│   │   └── index.ts
│   └── maple-functions/             # Individual function libraries
│       ├── create-artist/
│       ├── update-artist/
│       ├── sync-etsy-products/
│       ├── record-sale/
│       └── calculate-payout/
└── react/                           # React-specific utilities
    └── hooks/
        ├── use-async.ts
        ├── use-artists.ts
        └── index.ts
```

---

## File Reference Index

### Core Patterns

| Pattern | SOL File | Lines |
|---------|----------|-------|
| Requested<T> type | [libs/angular/request/src/lib/models/requested.type.ts](https://github.com/MountainSOLSchool/platform/blob/main/libs/angular/request/src/lib/models/requested.type.ts) | 1-15 |
| RequestedUtility | [libs/angular/request/src/lib/utilities/requested.utility.ts](https://github.com/MountainSOLSchool/platform/blob/main/libs/angular/request/src/lib/utilities/requested.utility.ts) | All |
| FunctionBuilder | [libs/firebase/functions/src/lib/utilities/functions.utility.ts](https://github.com/MountainSOLSchool/platform/blob/main/libs/firebase/functions/src/lib/utilities/functions.utility.ts) | All |
| AuthUtility | [libs/firebase/functions/src/lib/utilities/auth.utility.ts](https://github.com/MountainSOLSchool/platform/blob/main/libs/firebase/functions/src/lib/utilities/auth.utility.ts) | All |
| DatabaseUtility | [libs/firebase/database/src/lib/utilities/database.utility.ts](https://github.com/MountainSOLSchool/platform/blob/main/libs/firebase/database/src/lib/utilities/database.utility.ts) | All |

### Function Examples

| Function Type | SOL File | Description |
|---------------|----------|-------------|
| Simple query | [create-class.ts](https://github.com/MountainSOLSchool/platform/blob/main/libs/firebase/enrollment-functions/create-class/src/lib/create-class.ts) | Admin-only, validation, Firestore write |
| Complex orchestration | [enroll.ts](https://github.com/MountainSOLSchool/platform/blob/main/libs/firebase/enrollment-functions/enroll/src/lib/enroll.ts) | Payment, multi-step, error handling |
| Data lookup | [get-age-group-units.ts](https://github.com/MountainSOLSchool/platform/blob/main/libs/firebase/enrollment-functions/get-age-group-units/src/lib/get-age-group-units.ts) | Simple query with validation |
| Report generation | [tshirts.ts](https://github.com/MountainSOLSchool/platform/blob/main/libs/firebase/enrollment-functions/tshirts/src/lib/tshirts.ts) | Admin report |

### Form & UI Patterns

| Pattern | SOL File | Lines |
|---------|----------|-------|
| Form state machine | [class-form.component.ts](https://github.com/MountainSOLSchool/platform/blob/main/libs/angular/classes/class-management/src/lib/components/class-form/class-form.component.ts) | 89-94 |
| Image upload | [image-upload.component.ts](https://github.com/MountainSOLSchool/platform/blob/main/libs/angular/classes/class-management/src/lib/components/image-upload/image-upload.component.ts) | All |
| Vest validation | [class-validation.suite.ts](https://github.com/MountainSOLSchool/platform/blob/main/libs/ts/classes/classes-domain/src/lib/validation/class-validation.suite.ts) | All |

### State Management (React)

| Pattern | SOL File | Description |
|---------|----------|-------------|
| Redux store | [store.tsx](https://github.com/MountainSOLSchool/platform/blob/main/apps/student-portal/store/store.tsx) | Store configuration |
| Slice + Requested | [updateUnitsSlice.ts](https://github.com/MountainSOLSchool/platform/blob/main/apps/student-portal/store/updateUnits/updateUnitsSlice.ts) | State with async |
| Epics | [updateUnitsEpics.ts](https://github.com/MountainSOLSchool/platform/blob/main/apps/student-portal/store/updateUnits/updateUnitsEpics.ts) | Async operations |
| Custom hook | [useUnitsStore.ts](https://github.com/MountainSOLSchool/platform/blob/main/apps/student-portal/store/updateUnits/useUnitsStore.ts) | Component API |

### CI/CD

| Workflow | SOL File |
|----------|----------|
| Build check | [.github/workflows/build-check.yml](https://github.com/MountainSOLSchool/platform/blob/main/.github/workflows/build-check.yml) |
| Function deploy | [.github/workflows/firebase-functions-merge.yml](https://github.com/MountainSOLSchool/platform/blob/main/.github/workflows/firebase-functions-merge.yml) |
| Hosting deploy | [.github/workflows/firebase-hosting-merge.yml](https://github.com/MountainSOLSchool/platform/blob/main/.github/workflows/firebase-hosting-merge.yml) |

---

*Last updated: 2026-01-11*
