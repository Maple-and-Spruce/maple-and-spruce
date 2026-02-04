# Webflow Integration

This document describes the approach for integrating Maple & Spruce data with a Webflow marketing site.

## Overview

Maple & Spruce uses Firebase as its backend, with artist and product data stored in Firestore and images in Firebase Storage. The Webflow marketing site needs access to this data to display artist profiles and product galleries.

## Architecture

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│   Admin App         │     │   Firebase          │     │   Webflow Site      │
│   (Next.js)         │────▶│   Firestore +       │◀────│   (via API/CMS)     │
│                     │     │   Storage           │     │                     │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘
```

## Data Sources

### Artists

| Field | Description | Webflow Usage |
|-------|-------------|---------------|
| `name` | Artist's display name | Artist card title |
| `email` | Contact email | Optional contact link |
| `phone` | Phone number | Optional contact info |
| `defaultCommissionRate` | Commission split | Not displayed publicly |
| `status` | `active` or `inactive` | Filter (only show active) |
| `notes` | Internal notes | Not displayed publicly |
| `photoUrl` | Firebase Storage URL | Artist portrait image |

### Products

| Field | Description | Webflow Usage |
|-------|-------------|---------------|
| `name` | Product name | Product card title |
| `description` | Product description | Product details |
| `price` | Sale price | Price display |
| `imageUrl` | Product image URL | Product gallery |
| `status` | Product availability | Filter (only show available) |
| `artistId` | Reference to artist | Link to artist profile |

## Integration Approaches

### Option 1: Webflow CMS Sync (Recommended)

Use a scheduled Cloud Function to sync data from Firestore to Webflow CMS.

**Pros:**
- Native Webflow CMS features (filtering, sorting, pagination)
- Fast page loads (data is already in Webflow)
- Works with Webflow's built-in SEO features

**Cons:**
- Data sync delay (not real-time)
- Requires Webflow CMS API access (paid plan)
- Need to manage sync logic

**Implementation:**

1. Create a Cloud Function that runs on a schedule (e.g., hourly)
2. Query Firestore for active artists and available products
3. Transform data to Webflow CMS format
4. Use Webflow CMS API to create/update/delete items

```typescript
// Example sync function structure
export const syncToWebflow = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async () => {
    // 1. Fetch artists from Firestore
    const artists = await ArtistRepository.findAll({ status: 'active' });

    // 2. Fetch products from Firestore
    const products = await ProductRepository.findAll({ status: 'available' });

    // 3. Sync to Webflow CMS
    await webflowApi.syncCollection('artists', artists);
    await webflowApi.syncCollection('products', products);
  });
```

### Option 2: Direct API Calls

Use client-side JavaScript in Webflow to fetch data directly from Firebase.

**Pros:**
- Real-time data
- No sync logic needed
- Simpler initial setup

**Cons:**
- Slower page loads (API calls on every visit)
- SEO challenges (content loaded via JavaScript)
- Requires exposing read endpoints

**Implementation:**

1. Create public read-only Cloud Functions
2. Add JavaScript to Webflow pages to fetch and render data

### Option 3: Static JSON Export

Export data as static JSON files to a CDN, refresh periodically.

**Pros:**
- Fastest page loads
- Simple implementation
- Works with any website platform

**Cons:**
- Not real-time
- Manual or scheduled export process

## Image Handling

Artist photos are stored in Firebase Storage with public URLs:

```
https://storage.googleapis.com/{bucket}/artists/{artistId}/photo_{timestamp}.{ext}
```

These URLs are:
- Publicly accessible (no authentication required)
- Permanent (won't expire)
- CDN-backed for fast delivery

### Image Optimization for Webflow

For best performance in Webflow:

1. **Use Webflow's image optimization** - Upload images to Webflow CMS and let Webflow handle resizing/compression

2. **Or use Firebase Storage with transforms** - Consider using Firebase Extensions like "Resize Images" to create thumbnails

3. **Recommended image specs:**
   - Artist photos: 800x800px minimum, 1:1 aspect ratio
   - Product images: 1200x1200px minimum, 1:1 aspect ratio
   - Format: JPEG or WebP
   - Max file size: 5MB

## Security Considerations

### Public Data

Only sync public-safe data to Webflow:
- Artist name, photo, and contact info (if artist consents)
- Product name, description, price, and images

### Private Data

Never sync to Webflow:
- Commission rates
- Internal notes
- Email addresses (unless artist opts in)
- Sales data

### API Security

If using direct API calls:
- Use Firebase Security Rules to restrict access
- Consider rate limiting
- Use CORS to restrict which domains can call the API

## Implementation Checklist

- [ ] Decide on integration approach
- [ ] Set up Webflow CMS collections (if using Option 1)
- [ ] Create sync Cloud Function or public API endpoints
- [ ] Configure Firebase Security Rules
- [ ] Design Webflow templates for artist/product display
- [ ] Test sync process
- [ ] Set up monitoring for sync failures
- [ ] Document the sync schedule and process

## API Endpoints for Webflow

If creating public API endpoints, consider these:

| Endpoint | Description | Response |
|----------|-------------|----------|
| `GET /public/artists` | List active artists | `{ artists: Artist[] }` |
| `GET /public/artists/:id` | Single artist details | `{ artist: Artist }` |
| `GET /public/products` | List available products | `{ products: Product[] }` |
| `GET /public/products/:id` | Single product details | `{ product: Product }` |

## Webflow CMS Schema

### Artists Collection

| Field Name | Field Type | Notes |
|------------|------------|-------|
| `name` | Plain Text | Required |
| `slug` | Slug | Auto-generated from name |
| `photo` | Image | Upload from Firebase URL |
| `bio` | Rich Text | Optional, from notes (curated) |
| `firebase-id` | Plain Text | Hidden, for sync matching |

### Products Collection

| Field Name | Field Type | Notes |
|------------|------------|-------|
| `name` | Plain Text | Required |
| `slug` | Slug | Auto-generated from name |
| `description` | Rich Text | Product description |
| `price` | Number | In dollars |
| `image` | Image | Product photo |
| `artist` | Reference | Link to Artists collection |
| `firebase-id` | Plain Text | Hidden, for sync matching |

## Next Steps

1. Determine which integration approach fits your needs
2. If using CMS sync, set up Webflow API credentials
3. Create the necessary Cloud Functions
4. Test with sample data
5. Deploy and monitor

## Related Documentation

- [Firebase Storage Documentation](https://firebase.google.com/docs/storage)
- [Webflow CMS API](https://developers.webflow.com/reference/cms-api-reference)
- [Mountain Sol Platform](https://github.com/MountainSOLSchool/platform) - Reference implementation for image uploads
