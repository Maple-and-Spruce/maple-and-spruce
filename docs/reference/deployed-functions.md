# Deployed Functions

> All Cloud Functions deploy to `us-east4` (Northern Virginia). Codebase prefix: `maple-functions`.

## Artists
- `getArtists`, `getArtist`, `createArtist`, `updateArtist`, `deleteArtist`, `uploadArtistImage`

## Products
- `getProducts`, `getProduct`, `createProduct`, `updateProduct`, `deleteProduct`, `uploadProductImage`

## Categories
- `getCategories`, `createCategory`, `updateCategory`, `deleteCategory`, `reorderCategories`

## Instructors (Phase 3)
- `getInstructors`, `getInstructor`, `createInstructor`, `updateInstructor`, `deleteInstructor`

## Classes (Phase 3)
- `getClasses`, `getClass`, `createClass`, `updateClass`, `deleteClass`, `uploadClassImage`, `getPublicClasses`, `getPublicClass`

## Class Categories (Phase 3)
- `getClassCategories`

## Discounts (Phase 3c)
- `getDiscounts`, `createDiscount`, `updateDiscount`, `deleteDiscount`, `lookupDiscount`

## Registrations (Phase 3c)
- `getRegistrations`, `getRegistration`, `updateRegistration`, `calculateRegistrationCost`, `createRegistration`, `cancelRegistration`

## Infrastructure
- `healthCheck`, `squareWebhook`, `getPublicArtists`, `syncArtistToWebflow`
- `detectSyncConflicts`, `getSyncConflicts`, `getSyncConflictSummary`, `resolveSyncConflict`
