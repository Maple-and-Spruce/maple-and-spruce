# ADR-016: Webflow Integration Strategy

## Status

**Accepted** - 2026-01-20

## Context

Phase 2 of Maple & Spruce focuses on building the public website. We need to integrate our admin-managed data (artists, products, eventually classes/workshops) with the public-facing website.

### Key Stakeholders & Constraints

- **Katie** manages the Webflow site and needs full design control
- **Technical team** maintains the Firebase/admin backend
- **Current Webflow plan**: CMS ($276/year) - includes custom code embeds and CMS collections
- **Future need**: E-commerce (not near-term, but should design with it in mind)

### Options Considered

#### Option A: Embedded Components (iframe/custom code)

Embed React/JS components into Webflow that fetch data directly from Firebase.

**Pros:**
- Real-time data from Firebase
- Single source of truth (Firebase)
- No sync delays

**Cons:**
- Katie can position embeds but can't style individual elements
- More "app-like" feel, less native Webflow
- SEO concerns (content loaded via JS)
- Slower page loads (Firebase calls on every visit)
- Requires hosting embed scripts somewhere

#### Option B: CMS Collection Sync (Selected)

Push data from Firebase to Webflow CMS collections. Katie designs using native Webflow tools.

**Pros:**
- Katie has full visual design control over artist cards, layouts, etc.
- SEO-friendly (content is in Webflow CMS, not loaded via JS)
- Faster page loads (no external API calls)
- Works with Webflow's built-in filtering, sorting, pagination
- Native Webflow experience
- Content still managed in admin app (source of truth)

**Cons:**
- Sync delay between admin changes and public site
- Need to handle image hosting (Webflow CDN vs Firebase Storage)
- Additional complexity in maintaining sync
- Webflow API rate limits to consider

#### Option C: Hybrid (future consideration)

Use CMS sync for mostly-static content (artists, product catalog) and embedded components for dynamic features (inventory availability, class registration).

## Decision

**We will use Option B: CMS Collection Sync** for the initial Phase 2 implementation.

### Rationale

1. **Design Control**: Katie needs to design the artist showcase, product pages, etc. using Webflow's visual tools. Embedded components would limit her to positioning opaque boxes.

2. **SEO & Performance**: Artist and product content should be indexable by search engines and load quickly. CMS-native content achieves this.

3. **Separation of Concerns**: Admin app = content management, Webflow = presentation. Clean boundary.

4. **Future Flexibility**: We can add embedded components later for dynamic features (class registration, real-time inventory) while keeping the CMS approach for catalog content.

## Architecture

### Data Flow

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Admin App     │────▶│  Firebase        │────▶│  Webflow CMS    │
│  (Katie/David)  │     │  Cloud Function  │     │  Collections    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                       │                        │
        │                       │                        ▼
        │                       │               ┌─────────────────┐
        │                       │               │  Public Website │
        │                       │               │  (Webflow)      │
        │                       └──────────────▶│                 │
        │                         (images)      └─────────────────┘
        │
        │  Manage content
        ▼
┌─────────────────┐
│  Firebase       │
│  Firestore      │
└─────────────────┘
```

### Sync Direction

**Decision: One-way sync (Firebase → Webflow)**

```
Firebase (source of truth) ──────▶ Webflow CMS (presentation)
         ✏️ Edit here                    🚫 Don't edit synced fields
```

**Rationale:**
- Artist profiles have "official" data provided by artists themselves
- Changes should be tracked/auditable (admin app provides this)
- Avoids conflict resolution complexity
- Clear ownership: admin app owns data, Webflow owns presentation

**Webflow-only presentation fields** (not synced back):
- `featured` - Toggle for homepage spotlight
- `display-order` - Custom ordering for showcases
- `pull-quote` - Editorial highlight quote
- Any Webflow-specific layout/styling options

These fields can be freely edited in Webflow without affecting the source data.

### Sync Strategy

**Trigger**: Firestore document changes (onCreate, onUpdate, onDelete for artists/products)

**Mechanism**: Cloud Functions listen to Firestore changes and call Webflow CMS API

**Collections to Sync**:
- `artists` → Webflow "Artists" collection
- `products` → Webflow "Products" collection (future)
- `categories` → Webflow "Categories" collection (future)

### Image Handling

**Approach**: Use Firebase Storage URLs directly in Webflow CMS

- Images uploaded to Firebase Storage are publicly accessible
- Webflow CMS stores the URL reference
- No need to re-upload to Webflow CDN (simplifies sync)
- Trade-off: Images served from Firebase Storage, not Webflow CDN

**Alternative** (if performance is an issue):
- Upload images to Webflow CDN via API
- Store Webflow CDN URL back in Firebase
- More complex but potentially faster delivery

### Sync Triggers

| Event | Action |
|-------|--------|
| Artist created | Create Webflow CMS item |
| Artist updated | Update Webflow CMS item |
| Artist deleted/archived | Remove from Webflow CMS |
| Artist status → active | Add to Webflow CMS (if not present) |
| Artist status → inactive | Remove from Webflow CMS |

### Field Mapping (Artists)

**Synced Fields** (Firebase → Webflow, overwritten on each sync):

| Firebase Field | Webflow CMS Field | Type | Notes |
|----------------|-------------------|------|-------|
| `id` | `firebase-id` | Plain text | For sync reference, used as slug |
| `name` | `name` | Plain text | Title field (required) |
| `photoUrl` | `profile-image` | Image | URL to Firebase Storage |
| `bio` | `bio` | Rich text | Artist biography |
| `location` | `location` | Plain text | City/region |
| `specialties` | `specialties` | Plain text | Comma-separated list |
| `website` | `website` | Link | External website |
| `instagram` | `instagram` | Link | Instagram profile |
| `updatedAt` | `last-synced` | Date | Track sync freshness |

**Note**: Current Artist model (`libs/ts/domain/src/lib/artist.ts`) has:
- `id`, `name`, `email`, `phone`, `defaultCommissionRate`, `status`, `notes`, `photoUrl`, `createdAt`, `updatedAt`

**Fields to add** for richer public profiles:
- `bio` - Artist biography/statement
- `location` - City/region
- `specialties` - Array or comma-separated mediums/techniques
- `website` - External website URL
- `instagram` - Instagram handle or URL

These will be added to the domain model as part of implementation.

**Webflow-only Fields** (editable in Webflow, not synced):

| Webflow CMS Field | Type | Purpose |
|-------------------|------|---------|
| `featured` | Switch | Show on homepage spotlight |
| `display-order` | Number | Custom sort order for showcases |
| `pull-quote` | Plain text | Editorial highlight quote |
| `custom-tagline` | Plain text | Optional override for display |

**Important: Sync Behavior**

When an artist is updated in the admin app:
1. Cloud Function triggers on Firestore change
2. Synced fields are **overwritten** in Webflow CMS
3. Webflow-only fields are **preserved** (not touched by sync)

⚠️ **Warning**: If you edit a synced field (like `name` or `bio`) directly in Webflow, your changes will be lost on the next sync. Always edit synced content in the admin app.

### Error Handling

- **Retry logic**: Exponential backoff for Webflow API failures
- **Dead letter queue**: Failed syncs logged for manual review
- **Idempotency**: Sync operations should be safe to retry
- **Monitoring**: Alert on sync failures

### Rate Limits

Webflow CMS API rate limits (researched 2026-01-20):

| Limit | Value |
|-------|-------|
| General requests | 60/minute |
| Hourly limit | 1,000/hour per site |
| Site publish | 1/minute |
| Bulk operations | Up to 100 items/request |

**Mitigation strategies:**
- Use bulk endpoints for initial migration (100 items/request)
- Implement request queuing with rate limiting (e.g., Bottleneck library)
- Monitor `X-RateLimit-Remaining` header
- Handle HTTP 429 with exponential backoff
- Use webhooks instead of polling where possible

## Technical Details (Researched 2026-01-20)

### Authentication

**Site Token** (recommended for our use case):
- Created per-site in Webflow: Site settings → Apps & integrations → API access
- Include in `Authorization: Bearer <token>` header
- Supports scopes: no access, read-only, or read/write per API
- Expires after 365 days of inactivity (any API call resets timer)
- Limit: 5 tokens per site

**Workspace Token** (not needed):
- Enterprise-only, for workspace-level operations
- Doesn't have site scope access

**OAuth** (not needed):
- For multi-site integrations or marketplace apps
- More complex setup

**Decision**: Use Site Token stored in Firebase secrets (`WEBFLOW_API_TOKEN`)

**Webflow IDs** (for sync configuration):
- Site ID: `691a5d6c07ba1bf4714e826f`
- Artists Collection ID: `696f08a32a1eb691801f17ad`

### SDK

**Official Node.js SDK**: `webflow-api` (v3.2.1 as of Nov 2025)
```bash
npm install webflow-api
```

```typescript
import { WebflowClient } from "webflow-api";

const webflow = new WebflowClient({ accessToken: process.env.WEBFLOW_API_TOKEN });

// Create CMS item
const item = await webflow.collections.items.createItem(collectionId, {
  isArchived: false,
  isDraft: false, // false = publish immediately
  fieldData: {
    name: "Artist Name",
    slug: "artist-slug",
    bio: "Artist bio text...",
    "profile-image": { url: "https://storage.googleapis.com/..." }
  }
});
```

### Image Handling

Images in Webflow CMS require:
- **Publicly accessible URL** (Firebase Storage URLs work)
- **Max file size**: 4MB
- **Format for API**:
  ```json
  {
    "profile-image": {
      "url": "https://storage.googleapis.com/maple-and-spruce.appspot.com/artists/123.jpg",
      "alt": "Artist name profile photo"
    }
  }
  ```

**Note**: Webflow will fetch and cache the image from the URL. Our Firebase Storage URLs are already public, so this works seamlessly.

### Staged vs Live Items

- **Default**: Items created via API are "staged" (draft)
- **Publish immediately**: Set `isDraft: false` in request
- **Workflow**: We'll publish immediately since admin approval happens in our app

### API Endpoints (v2)

| Operation | Endpoint |
|-----------|----------|
| List collections | `GET /v2/sites/{site_id}/collections` |
| Get collection | `GET /v2/collections/{collection_id}` |
| Create item | `POST /v2/collections/{collection_id}/items` |
| Update item | `PATCH /v2/collections/{collection_id}/items/{item_id}` |
| Delete item | `DELETE /v2/collections/{collection_id}/items/{item_id}` |
| Bulk create | `POST /v2/collections/{collection_id}/items` (array body) |

## Implementation Plan

### Phase 2a: Artist Showcase

1. **Research Webflow CMS API** ✅ Complete
   - API authentication: Site Token
   - Collection/item CRUD: via SDK
   - Rate limits: 60/min, 1000/hr
   - Image handling: URL references to Firebase Storage

2. **Set up Webflow CMS collection**
   - Create "Artists" collection in Webflow
   - Define fields matching our data model
   - Design artist card/page templates

3. **Implement sync function**
   - `syncArtistToWebflow` Cloud Function
   - Firestore trigger on artists collection
   - Use `webflow-api` SDK

4. **Initial data migration**
   - One-time sync of existing artists
   - Verify data integrity

5. **Testing & monitoring**
   - End-to-end sync testing
   - Error alerting
   - Sync status dashboard (stretch)

### Future Phases

- Product catalog sync (Phase 2b)
- Category sync
- Class/workshop sync (Phase 3)
- Real-time inventory embeds (hybrid approach)

## Consequences

### Positive

- Katie has full design control over public site
- SEO-optimized content
- Fast page loads
- Clean separation between admin and public sites
- Scalable pattern for future content types

### Negative

- Sync delay (seconds to minutes) between admin changes and public site
- Additional infrastructure to maintain (sync functions)
- Need to handle sync failures gracefully
- Webflow API dependency

### Risks

- Webflow API changes could break sync
- Rate limits could impact bulk operations
- Image URL approach may have performance implications

## E-commerce Considerations (Future)

When we add e-commerce capabilities:

### Square Web Payments SDK

For checkout/payment processing, we'll use **Square Web Payments SDK** embedded in Webflow:
- Embed payment form via custom code
- Square handles PCI compliance
- Webhook to Firebase for order processing
- Works alongside CMS-synced product catalog

### Inventory Display Options

| Approach | Pros | Cons |
|----------|------|------|
| CMS sync (current plan) | Native Webflow design, SEO | Slight delay in stock updates |
| Embedded component | Real-time inventory | Less design control |
| Hybrid | Best of both | More complexity |

**Recommendation**: Start with CMS sync. If real-time inventory becomes critical (e.g., limited edition drops), add embedded inventory badges as enhancement.

## References

- [Webflow CMS API Documentation](https://developers.webflow.com/data/reference/cms)
- [Webflow JS SDK](https://github.com/webflow/js-webflow-api)
- [Webflow Rate Limits](https://developers.webflow.com/data/reference/rate-limits)
- [Webflow Authentication](https://developers.webflow.com/data/reference/authentication)
- [Epic #93 - Public Website](https://github.com/mapleandspruce/maple-and-spruce/issues/93)
- Phase 2 roadmap in AGENTS.md
