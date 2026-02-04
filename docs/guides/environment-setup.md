# Environment & Secrets Setup

## Per-Project Secrets Pattern

**Same secret names in each Firebase project, different values:**

| Secret | Dev Project | Prod Project |
|--------|-------------|--------------|
| `SQUARE_ACCESS_TOKEN` | Sandbox token | Production token |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | Sandbox key | Production key |

**No more `_PROD` suffix** - the project itself determines the environment.

## Environment Detection

The web app selects Firebase config in this order:

1. **`NEXT_PUBLIC_FIREBASE_ENV`** environment variable (checked first)
   - Set in Vercel for deployed apps
   - Values: `dev` or `prod`
2. **Hostname fallback** for local development:
   - `localhost` or `127.0.0.1` -> dev
   - `*-dev.*` hostname -> dev
   - Everything else -> prod

**Vercel Environment Variables (required):**

| Project | Variable | Value |
|---------|----------|-------|
| Production | `NEXT_PUBLIC_FIREBASE_ENV` | `prod` |
| Development | `NEXT_PUBLIC_FIREBASE_ENV` | `dev` |

**No `.env.local` needed** - Firebase client config is hardcoded in `libs/ts/firebase/firebase-config/`.

## FirebaseProject Utility (Cloud Functions)

For Cloud Functions, use `FirebaseProject` from `@maple/firebase/functions`:

```typescript
import { FirebaseProject } from '@maple/firebase/functions';

// Auto-detects project from GCLOUD_PROJECT or FIREBASE_CONFIG
FirebaseProject.projectId      // 'maple-and-spruce' or 'maple-and-spruce-dev'
FirebaseProject.storageBucket  // '{project-id}.firebasestorage.app'
FirebaseProject.functionUrl('squareWebhook')  // Full webhook URL
FirebaseProject.isDev / FirebaseProject.isProd  // Environment checks
```

See `libs/firebase/functions/src/lib/environment.utility.ts` for full documentation.

## Square Webhook URLs

**IMPORTANT**: Webhook signature verification requires the URL to match exactly what's registered in Square Dashboard. Use the `cloudfunctions.net` format, NOT the Cloud Run URLs.

| Environment | Webhook URL (register in Square) |
|-------------|----------------------------------|
| Production | `https://us-east4-maple-and-spruce.cloudfunctions.net/squareWebhook` |
| Development | `https://us-east4-maple-and-spruce-dev.cloudfunctions.net/squareWebhook` |

## Never Commit

- Firebase service account keys
- API keys or tokens (Square, Etsy, etc.)
- `.secret.local` files
- `.env` files containing tokens
