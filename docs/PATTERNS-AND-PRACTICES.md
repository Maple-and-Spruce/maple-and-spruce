# Maple & Spruce - Patterns and Practices Guide

> Patterns inspired by [Mountain Sol's platform](https://github.com/MountainSOLSchool/platform), adapted for Next.js/React with Firebase

**See also**: [SOL-PATTERNS-REFERENCE.md](./SOL-PATTERNS-REFERENCE.md) for detailed source code references.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Folder Structure](#folder-structure)
3. [State Management Patterns](#state-management-patterns)
4. [Data Access Patterns](#data-access-patterns)
5. [API & Backend Patterns](#api--backend-patterns)
6. [Firebase Cloud Functions](#firebase-cloud-functions)
7. [Payment Processing](#payment-processing)
8. [Authentication & Authorization](#authentication--authorization)
9. [UI Component Patterns](#ui-component-patterns)
10. [Validation Patterns](#validation-patterns)
11. [Error Handling](#error-handling)
12. [Testing Strategy](#testing-strategy)
13. [Third-Party Services](#third-party-services)
14. [Dependencies](#dependencies)

---

## Architecture Overview

### Core Principles

1. **Monorepo with Nx** - Single repository, multiple apps, shared packages
2. **Type Safety First** - Strict TypeScript everywhere
3. **Repository Pattern** - Abstract database from business logic
4. **Server-First** - Business logic lives on the server (API routes/Cloud Functions)
5. **Explicit State** - No implicit loading states; use discriminated unions

### Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | Next.js 15 + React 19 | Web application |
| UI Components | MUI (Material UI) | Component library |
| Design System | Google Material Design | Design language |
| State | React hooks + Context | Local/global state |
| Database | Firebase Firestore | Primary data store |
| Auth | Firebase Authentication | User management |
| Backend | Firebase Cloud Functions | Server-side logic |
| Payments | Stripe | Payment processing |
| Email | Firebase mail extension or Resend | Transactional email |

### Brand Colors

| Name | Hex | Usage |
|------|-----|-------|
| Cream | `#D5D6C8` | Backgrounds |
| Dark Brown | `#4A3728` | Headings, primary text |
| Sage Green | `#6B7B5E` | Buttons, accents |
| Warm Gray | `#7A7A6E` | Body text |
| White | `#FFFFFF` | Cards, inputs |

---

## Folder Structure

```
maple-and-spruce/
├── apps/
│   └── maple-spruce/                 # Main Next.js app
│       ├── src/
│       │   ├── app/                  # Next.js App Router
│       │   │   ├── (public)/         # Public pages (no auth)
│       │   │   │   ├── page.tsx      # Home
│       │   │   │   ├── classes/      # Browse classes
│       │   │   │   ├── shop/         # Browse products
│       │   │   │   └── about/        # About page
│       │   │   ├── (customer)/       # Customer portal
│       │   │   │   ├── dashboard/    # Customer dashboard
│       │   │   │   ├── my-classes/   # Purchased classes
│       │   │   │   └── profile/      # Profile settings
│       │   │   ├── (admin)/          # Admin portal
│       │   │   │   ├── dashboard/    # Admin overview
│       │   │   │   ├── classes/      # Manage classes
│       │   │   │   ├── products/     # Manage inventory
│       │   │   │   ├── artists/      # Artist management
│       │   │   │   ├── teachers/     # Teacher management
│       │   │   │   └── payouts/      # Commission payouts
│       │   │   ├── api/              # API routes
│       │   │   │   ├── classes/
│       │   │   │   ├── products/
│       │   │   │   ├── payments/
│       │   │   │   ├── webhooks/
│       │   │   │   └── sync/         # External syncs (Etsy, Square)
│       │   │   └── layout.tsx
│       │   ├── components/           # App-specific components
│       │   ├── hooks/                # Custom hooks
│       │   ├── lib/                  # Utilities & helpers
│       │   │   ├── firebase/         # Firebase client setup
│       │   │   └── theme/            # MUI theme config
│       │   └── types/                # TypeScript types
│       └── package.json
├── packages/
│   ├── ui/                           # Shared UI components
│   │   └── src/
│   │       ├── theme.ts              # MUI theme with brand colors
│   │       └── ...
│   ├── domain/                       # Domain models (shared types)
│   │   └── src/
│   │       ├── artist.ts
│   │       ├── product.ts
│   │       ├── sale.ts
│   │       └── payout.ts
│   ├── firebase/                     # Firebase utilities
│   │   └── src/
│   │       ├── client.ts             # Firebase client init
│   │       ├── admin.ts              # Firebase admin SDK
│   │       └── repositories/
│   │           ├── artist.repository.ts
│   │           ├── product.repository.ts
│   │           └── sale.repository.ts
│   └── functions/                    # Cloud Functions
│       └── src/
│           ├── index.ts
│           └── handlers/
└── docs/
    ├── PATTERNS-AND-PRACTICES.md     # This file
    ├── REQUIREMENTS.md               # Business requirements
    └── DECISIONS.md                  # Architecture decisions
```

---

## State Management Patterns

### Pattern 1: Request State (Loading/Loaded/Error)

Never use boolean `isLoading`. Use discriminated unions:

```typescript
// packages/domain/src/request-state.ts
export type RequestState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string };

// Usage in component
const [artists, setArtists] = useState<RequestState<Artist[]>>({ status: 'idle' });

// Render based on state
{artists.status === 'loading' && <CircularProgress />}
{artists.status === 'error' && <Alert severity="error">{artists.error}</Alert>}
{artists.status === 'success' && <ArtistList artists={artists.data} />}
```

### Pattern 2: Form State Machine

For multi-step processes (checkout, registration):

```typescript
type CheckoutState =
  | { step: 'cart'; items: CartItem[] }
  | { step: 'info'; items: CartItem[]; info: CustomerInfo }
  | { step: 'payment'; items: CartItem[]; info: CustomerInfo }
  | { step: 'processing'; orderId: string }
  | { step: 'complete'; orderId: string; confirmationNumber: string }
  | { step: 'error'; message: string };
```

### Pattern 3: Server State with React Query

For data that lives on the server:

```typescript
// hooks/use-artists.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArtistRepository } from '@maple-spruce/firebase';

export function useArtists() {
  return useQuery({
    queryKey: ['artists'],
    queryFn: () => ArtistRepository.findAll(),
  });
}

export function useCreateArtist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateArtistInput) => ArtistRepository.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artists'] });
    },
  });
}
```

---

## Data Access Patterns

### Repository Pattern with Firestore

Abstract Firestore access behind repository classes (like Mountain Sol):

```typescript
// packages/firebase/src/repositories/artist.repository.ts
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  query,
  where,
  Timestamp
} from 'firebase/firestore';
import { db } from '../client';
import type { Artist, CreateArtistInput } from '@maple-spruce/domain';

const COLLECTION = 'artists';

export const ArtistRepository = {
  async findAll(): Promise<Artist[]> {
    const q = query(
      collection(db, COLLECTION),
      where('status', '==', 'active')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as Artist));
  },

  async findById(id: string): Promise<Artist | null> {
    const docRef = doc(db, COLLECTION, id);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) return null;
    return { id: snapshot.id, ...snapshot.data() } as Artist;
  },

  async create(input: CreateArtistInput): Promise<Artist> {
    const data = {
      ...input,
      status: 'active',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    const docRef = await addDoc(collection(db, COLLECTION), data);
    return { id: docRef.id, ...data } as Artist;
  },

  async update(id: string, input: Partial<Artist>): Promise<void> {
    const docRef = doc(db, COLLECTION, id);
    await updateDoc(docRef, {
      ...input,
      updatedAt: Timestamp.now(),
    });
  },
};
```

### Why Repositories?

1. **Testability** - Mock the repository, not Firestore
2. **Single source of truth** - All Firestore queries in one place
3. **Type safety** - Return domain types, not raw Firestore docs
4. **Encapsulation** - Change database without touching components

---

## API & Backend Patterns

> **SOL Reference**: See [SOL-PATTERNS-REFERENCE.md#firebase-cloud-functions-architecture](./SOL-PATTERNS-REFERENCE.md#firebase-cloud-functions-architecture)

### API Route Structure

```typescript
// app/api/artists/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { ArtistRepository } from '@maple-spruce/firebase';
import { createArtistSchema } from '@maple-spruce/domain';
import { getServerSession } from '@/lib/auth';

export async function GET() {
  try {
    const artists = await ArtistRepository.findAll();
    return NextResponse.json(artists);
  } catch (error) {
    console.error('Failed to fetch artists:', error);
    return NextResponse.json(
      { error: 'Failed to fetch artists' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const session = await getServerSession();
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Validate input
    const body = await request.json();
    const parsed = createArtistSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Create
    const artist = await ArtistRepository.create(parsed.data);
    return NextResponse.json(artist, { status: 201 });
  } catch (error) {
    console.error('Failed to create artist:', error);
    return NextResponse.json(
      { error: 'Failed to create artist' },
      { status: 500 }
    );
  }
}
```

### Cloud Functions (for complex operations)

```typescript
// packages/functions/src/handlers/generate-payouts.ts
import * as functions from 'firebase-functions';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

export const generatePayouts = functions.https.onCall(async (data, context) => {
  // Auth check
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const { month, year } = data;
  const db = getFirestore();

  // Get all sales for the period that aren't yet in a payout
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  const salesSnapshot = await db.collection('sales')
    .where('soldAt', '>=', Timestamp.fromDate(startDate))
    .where('soldAt', '<=', Timestamp.fromDate(endDate))
    .where('payoutId', '==', null)
    .get();

  // Group by artist and create payouts
  // ... (implementation)

  return { success: true, payoutsCreated: payoutCount };
});
```

---

## Firebase Cloud Functions

> **SOL Reference**: See [SOL-PATTERNS-REFERENCE.md#firebase-cloud-functions-architecture](./SOL-PATTERNS-REFERENCE.md#firebase-cloud-functions-architecture)

### Library-Per-Function Pattern

Following Mountain Sol's pattern, each Cloud Function should be its own Nx library for granular deployment:

```
libs/firebase/maple-functions/
├── create-artist/
│   ├── src/
│   │   ├── lib/create-artist.ts
│   │   └── index.ts
│   └── project.json
├── sync-etsy-products/
├── record-sale/
└── calculate-payout/
```

### Function Builder Pattern

Create a utility for consistent function structure:

```typescript
// libs/firebase/functions/src/functions.utility.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

export enum Role {
    Admin = 'admin',
}

interface FunctionOptions {
    requiredRole?: Role;
}

export function createFunction<TReq, TRes>(
    handler: (data: TReq, context: { uid?: string }) => Promise<TRes>,
    options?: FunctionOptions
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
```

### Example Function Implementation

```typescript
// libs/firebase/maple-functions/create-artist/src/lib/create-artist.ts
import { createFunction, Role } from '@maple/firebase/functions';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import type { CreateArtistRequest, Artist } from '@maple/ts/api-types';

export const createArtist = createFunction<CreateArtistRequest, Artist>(
    async (data, context) => {
        const db = getFirestore();

        // Validation
        if (!data.name?.trim()) {
            throw new Error('Name is required');
        }
        if (!data.email?.trim()) {
            throw new Error('Email is required');
        }

        // Create document
        const artistData = {
            name: data.name.trim(),
            email: data.email.trim(),
            phone: data.phone?.trim() || null,
            commissionRate: data.commissionRate,
            status: 'active',
            notes: data.notes || null,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        };

        const docRef = await db.collection('artists').add(artistData);

        return {
            id: docRef.id,
            ...artistData,
        } as Artist;
    },
    { requiredRole: Role.Admin }
);
```

### Shared API Types

```typescript
// libs/ts/firebase/api-types/src/artist.types.ts
export interface CreateArtistRequest {
    name: string;
    email: string;
    phone?: string;
    commissionRate: number;
    notes?: string;
}

export interface UpdateArtistRequest extends Partial<CreateArtistRequest> {
    id: string;
}
```

---

## Payment Processing

### Stripe Integration Pattern

Follow Mountain Sol's 3-layer architecture:

```
┌─────────────────────────────────────────────────────────────┐
│  LAYER 1: UI Component                                       │
│  - Stripe Elements for card input                            │
│  - Form validation before submit                             │
│  - Display payment status                                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 2: API Route / Cloud Function                         │
│  - Validate request                                          │
│  - Create payment record in Firestore (status: pending)      │
│  - Call Stripe API                                           │
│  - Update payment record (status: complete/failed)           │
│  - Trigger confirmation email                                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 3: Webhook Handler                                    │
│  - Handle async Stripe events                                │
│  - Update order status                                       │
│  - Handle refunds, disputes                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Authentication & Authorization

### Firebase Auth Pattern

```typescript
// lib/firebase/auth.ts
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { app, db } from './client';

const auth = getAuth(app);

export async function signIn(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signOut() {
  return firebaseSignOut(auth);
}

export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export async function isAdmin(userId: string): Promise<boolean> {
  const adminDoc = await getDoc(doc(db, 'admins', userId));
  return adminDoc.exists();
}
```

### Auth Context

```typescript
// lib/firebase/auth-context.tsx
'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { onAuthChange, isAdmin } from './auth';

interface AuthState {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({
  user: null,
  isAdmin: false,
  loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAdmin: false,
    loading: true,
  });

  useEffect(() => {
    return onAuthChange(async (user) => {
      if (user) {
        const adminStatus = await isAdmin(user.uid);
        setState({ user, isAdmin: adminStatus, loading: false });
      } else {
        setState({ user: null, isAdmin: false, loading: false });
      }
    });
  }, []);

  return (
    <AuthContext.Provider value={state}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

---

## UI Component Patterns

### MUI Theme Setup

```typescript
// packages/ui/src/theme.ts
import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    primary: {
      main: '#6B7B5E', // Sage Green
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#4A3728', // Dark Brown
      contrastText: '#FFFFFF',
    },
    background: {
      default: '#D5D6C8', // Cream
      paper: '#FFFFFF',
    },
    text: {
      primary: '#4A3728', // Dark Brown
      secondary: '#7A7A6E', // Warm Gray
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      color: '#4A3728',
      fontWeight: 600,
    },
    h2: {
      color: '#4A3728',
      fontWeight: 600,
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 8,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
  },
});
```

### Using MUI Components

```typescript
// components/artist-card.tsx
import { Card, CardContent, Typography, Chip, Avatar, Box } from '@mui/material';
import type { Artist } from '@maple-spruce/domain';

interface ArtistCardProps {
  artist: Artist;
  onClick?: () => void;
}

export function ArtistCard({ artist, onClick }: ArtistCardProps) {
  return (
    <Card
      sx={{ cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
    >
      <CardContent>
        <Box display="flex" alignItems="center" gap={2} mb={2}>
          <Avatar>{artist.name[0]}</Avatar>
          <Box>
            <Typography variant="h6">{artist.name}</Typography>
            <Typography variant="body2" color="text.secondary">
              {artist.email}
            </Typography>
          </Box>
        </Box>
        <Chip
          label={`${(artist.commissionRate * 100).toFixed(0)}% commission`}
          size="small"
          color="primary"
          variant="outlined"
        />
      </CardContent>
    </Card>
  );
}
```

---

## Error Handling

### API Error Format

```typescript
// lib/errors.ts
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public details?: Record<string, string[]>) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}
```

### Error Boundary with MUI

```typescript
// components/error-boundary.tsx
'use client';

import { useEffect } from 'react';
import { Button, Typography, Box, Paper } from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      minHeight="400px"
    >
      <Paper sx={{ p: 4, textAlign: 'center', maxWidth: 400 }}>
        <ErrorOutlineIcon sx={{ fontSize: 48, color: 'error.main', mb: 2 }} />
        <Typography variant="h5" gutterBottom>
          Something went wrong
        </Typography>
        <Typography color="text.secondary" mb={3}>
          We're sorry, but something unexpected happened.
        </Typography>
        <Button variant="contained" onClick={reset}>
          Try again
        </Button>
      </Paper>
    </Box>
  );
}
```

---

## Validation Patterns

> **SOL Reference**: See [SOL-PATTERNS-REFERENCE.md#validation-patterns](./SOL-PATTERNS-REFERENCE.md#validation-patterns)

### Vest Validation Framework

Use [Vest](https://vestjs.dev/) for declarative validation that can be shared between client and server.

```typescript
// libs/ts/validation/src/artist.validation.ts
import { create, test, enforce, only } from 'vest';
import type { Artist } from '@maple/ts/domain';

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

    test('commissionRate', 'Commission rate is required', () => {
        enforce(data.commissionRate).isNotNullish();
    });

    test('commissionRate', 'Commission rate must be between 0 and 100', () => {
        enforce(data.commissionRate).isBetween(0, 100);
    });
});

// Usage in component
const result = artistValidation(formData);
if (result.hasErrors()) {
    const errors = result.getErrors();
    // { name: ['Name is required'], email: ['Email must be valid'] }
}
```

### Form State Machine

Use discriminated unions for form submission state:

```typescript
type FormState =
    | { status: 'idle' }
    | { status: 'submitting' }
    | { status: 'success'; data: Artist }
    | { status: 'error'; message: string };

const [formState, setFormState] = useState<FormState>({ status: 'idle' });

const handleSubmit = async (data: ArtistFormData) => {
    // Validate first
    const validation = artistValidation(data);
    if (validation.hasErrors()) {
        setFormState({ status: 'error', message: 'Please fix validation errors' });
        return;
    }

    setFormState({ status: 'submitting' });
    try {
        const result = await createArtist(data);
        setFormState({ status: 'success', data: result });
    } catch (error) {
        setFormState({ status: 'error', message: error.message });
    }
};
```

---

## Testing Strategy

### Unit Tests (Vitest)

```typescript
// packages/domain/src/__tests__/payout.test.ts
import { describe, it, expect } from 'vitest';
import { calculateArtistEarnings, calculateCommission } from '../payout';

describe('payout calculations', () => {
  it('calculates artist earnings correctly', () => {
    // Artist gets 60% (commission rate is 40% to store)
    expect(calculateArtistEarnings(100, 0.40)).toBe(60);
  });

  it('calculates commission correctly', () => {
    expect(calculateCommission(100, 0.40)).toBe(40);
  });
});
```

### Integration Tests (Playwright)

```typescript
// apps/maple-spruce-e2e/src/admin-artists.spec.ts
import { test, expect } from '@playwright/test';

test('admin can create an artist', async ({ page }) => {
  // Login as admin
  await page.goto('/login');
  await page.fill('[name="email"]', 'admin@example.com');
  await page.fill('[name="password"]', 'password');
  await page.click('button[type="submit"]');

  // Navigate to artists
  await page.goto('/admin/artists');
  await page.click('[data-testid="add-artist"]');

  // Fill form
  await page.fill('[name="name"]', 'Jane Artist');
  await page.fill('[name="email"]', 'jane@example.com');
  await page.fill('[name="commissionRate"]', '40');
  await page.click('button[type="submit"]');

  // Verify created
  await expect(page.locator('text=Jane Artist')).toBeVisible();
});
```

---

## Third-Party Services

### When to Use Third-Party vs. Build

| Need | Build Custom | Use Third-Party |
|------|--------------|-----------------|
| Artist/product tracking | ✅ Core business logic | |
| Payment processing | | ✅ Stripe |
| Calendar booking (future) | | ✅ Cal.com |
| Email sending | | ✅ Firebase mail or Resend |
| Etsy sync | ✅ Custom integration | |
| POS sync (future) | ✅ Custom integration | ✅ Square API |

### Square Catalog API Patterns

The Square Catalog API has specific patterns that differ from typical REST APIs.

#### Variation Location

When fetching a catalog item with `includeRelatedObjects: true`, the variation may be in two places:

```typescript
const response = await client.catalog.object.get({
  objectId: itemId,
  includeRelatedObjects: true,
});

// Check BOTH locations for the variation
let variation = response.relatedObjects?.find(obj => obj.id === variationId);
if (!variation) {
  variation = response.object?.itemData?.variations?.find(v => v.id === variationId);
}
```

#### batchUpsert Structure

When updating items with variations, **nest variations inside the item** - do NOT send them as separate objects:

```typescript
// WRONG - causes "Duplicate object" error
await client.catalog.batchUpsert({
  batches: [{
    objects: [
      { type: 'ITEM', id: itemId, itemData: {...} },
      { type: 'ITEM_VARIATION', id: variationId, ... }  // DUPLICATE!
    ]
  }]
});

// CORRECT - nest variation inside item
await client.catalog.batchUpsert({
  batches: [{
    objects: [{
      type: 'ITEM',
      id: itemId,
      version: BigInt(catalogVersion),
      itemData: {
        ...itemData,
        variations: [{
          type: 'ITEM_VARIATION',
          id: variationId,
          version: variationVersion,
          itemVariationData: {...}
        }]
      }
    }]
  }]
});
```

#### Optimistic Locking

Square uses version fields for concurrency control:

```typescript
// Always include version when updating
{
  type: 'ITEM',
  id: itemId,
  version: BigInt(catalogVersion),  // From previous fetch
  itemData: {...}
}
```

#### Webhook Signature Verification

Webhook URLs must match **exactly** what's registered in Square Dashboard. Use the `cloudfunctions.net` format:

```
https://us-east4-{project}.cloudfunctions.net/squareWebhook
```

NOT the Cloud Run URL format (`https://squarewebhook-xxx.a.run.app`).

### Etsy Integration Pattern

```typescript
// lib/integrations/etsy.ts
const ETSY_API_BASE = 'https://api.etsy.com/v3';

export const EtsyClient = {
  async getListings(shopId: string): Promise<EtsyListing[]> {
    const res = await fetch(
      `${ETSY_API_BASE}/application/shops/${shopId}/listings/active`,
      {
        headers: {
          'x-api-key': process.env.ETSY_API_KEY!,
        },
      }
    );
    const data = await res.json();
    return data.results;
  },

  async getReceipts(shopId: string): Promise<EtsyReceipt[]> {
    // Get recent orders
    const res = await fetch(
      `${ETSY_API_BASE}/application/shops/${shopId}/receipts`,
      {
        headers: {
          'x-api-key': process.env.ETSY_API_KEY!,
          'Authorization': `Bearer ${process.env.ETSY_ACCESS_TOKEN}`,
        },
      }
    );
    const data = await res.json();
    return data.results;
  },
};
```

---

## Quick Reference

### File Naming Conventions

- Components: `kebab-case.tsx` (e.g., `artist-card.tsx`)
- Hooks: `use-kebab-case.ts` (e.g., `use-artists.ts`)
- Types: `kebab-case.ts` (e.g., `artist.ts`)
- API routes: `route.ts` in folder structure
- Tests: `*.test.ts` or `*.spec.ts`

### Import Aliases

```typescript
// tsconfig.json paths
"@/*": ["./src/*"]
"@maple-spruce/ui": ["../../packages/ui/src"]
"@maple-spruce/domain": ["../../packages/domain/src"]
"@maple-spruce/firebase": ["../../packages/firebase/src"]
```

### Local Development Environment

**Key principle: Use production Firebase services, run only functions locally.**

The project is configured to connect directly to production Firebase services (Auth, Firestore, Storage) during local development. Only the Cloud Functions emulator runs locally.

```bash
# Start local development
npm run dev              # Next.js app on localhost:3000
npx nx build functions   # Build functions
firebase emulators:start # Functions emulator on localhost:5001
```

**Why this approach:**
- Simpler setup - no seed data or emulator state management
- Real data for testing - see actual artists, products, etc.
- Firebase CLI handles authentication automatically via `firebase login`
- Single source of truth - no sync issues between local and production data

**firebase.json emulators configuration:**
```json
{
  "emulators": {
    "functions": {
      "port": 5001
    },
    "ui": {
      "enabled": true,
      "port": 4000
    },
    "singleProjectMode": true
  }
}
```

### FirebaseProject Utility

Use `FirebaseProject` from `@maple/firebase/functions` for project-aware resource access:

```typescript
import { FirebaseProject } from '@maple/firebase/functions';
import admin from 'firebase-admin';

// Storage bucket (auto-detects project)
const bucket = admin.storage().bucket(FirebaseProject.storageBucket);

// Function URLs (for webhooks, callbacks)
const webhookUrl = FirebaseProject.functionUrl('squareWebhook');

// Environment checks
if (FirebaseProject.isDev) {
  console.log('Running in dev project');
}
```

**Available properties:**
- `FirebaseProject.projectId` - Current project ID (`maple-and-spruce` or `maple-and-spruce-dev`)
- `FirebaseProject.storageBucket` - Storage bucket name (`{project-id}.firebasestorage.app`)
- `FirebaseProject.functionsBaseUrl` - Functions base URL (`https://us-east4-{project-id}.cloudfunctions.net`)
- `FirebaseProject.functionUrl(name)` - Full URL for a specific function
- `FirebaseProject.isDev` / `FirebaseProject.isProd` - Environment checks

**Detection order:**
1. `GCLOUD_PROJECT` - Set by Cloud Functions runtime
2. `FIREBASE_CONFIG.projectId` - Set by Firebase emulator
3. Falls back to prod (safe default for deployed functions)

### Environment Variables

**No `.env.local` required for local development.** Firebase client config is hardcoded in `libs/ts/firebase/firebase-config/` for both dev and prod environments. Environment detection is automatic based on hostname.

Cloud Functions secrets (Square tokens, etc.) are managed per-project in Firebase - see [AGENTS.md](../.claude/AGENTS.md#per-project-secrets-pattern).

---

## Dependencies

### Required for Phase 1

Add these dependencies to support the patterns above:

```bash
# Form validation
npm install vest

# Server state management
npm install @tanstack/react-query

# UI components (already have MUI base)
npm install @mui/x-data-grid @mui/x-date-pickers

# Date handling
npm install date-fns

# Firebase Functions v2
npm install firebase-functions@latest
```

### package.json Additions

```json
{
  "dependencies": {
    "vest": "^5.4.6",
    "@tanstack/react-query": "^5.0.0",
    "@mui/x-data-grid": "^7.0.0",
    "@mui/x-date-pickers": "^7.0.0",
    "date-fns": "^3.0.0",
    "firebase-functions": "^7.0.0"
  },
  "devDependencies": {
    "vitest": "^2.0.0",
    "@testing-library/react": "^16.0.0"
  }
}
```

### SOL Dependencies Reference

These are the key dependencies from Mountain Sol that inform our choices:

| SOL Dependency | Version | Maple Equivalent |
|----------------|---------|------------------|
| `vest` | ^5.4.6 | vest ^5.4.6 |
| `@ngrx/component-store` | ^20.x | @tanstack/react-query |
| `primeng` / `primereact` | ^17.x | MUI components |
| `firebase` | ^11.x | firebase ^12.x |
| `firebase-functions` | ^7.x | firebase-functions ^7.x |
| `@reduxjs/toolkit` | ^2.x | (optional - for complex state) |

---

## Quick Reference

### Pattern Checklist

When building a new feature, ensure:

- [ ] Use `RequestState<T>` for async data, not boolean flags
- [ ] Create repository for Firestore access
- [ ] Add Vest validation suite for forms
- [ ] Use MUI theme colors, not hardcoded hex
- [ ] Create types in `@maple/ts/domain`
- [ ] Add API types in `@maple/ts/api-types`
- [ ] Follow library-per-function for Cloud Functions

### File Locations

| Type | Location |
|------|----------|
| Domain types | `libs/ts/domain/src/` |
| API types | `libs/ts/firebase/api-types/src/` |
| Validation | `libs/ts/validation/src/` |
| Repositories | `libs/firebase/database/src/` |
| Cloud Functions | `libs/firebase/maple-functions/*/` |
| React hooks | `apps/maple-spruce/src/hooks/` |
| Components | `apps/maple-spruce/src/components/` |

---

*Last updated: 2026-01-19*
