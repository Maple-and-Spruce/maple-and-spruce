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

## Firebase Emulators (Integration Tests)

Integration tests run against the Firebase local emulator suite. Emulator ports are configured in `firebase.json`:

| Emulator | Port | Purpose |
|----------|------|---------|
| Auth | 9099 | User creation, sign-in, ID tokens |
| Firestore | 8080 | Document reads/writes |
| Functions | 5001 | Cloud Function execution |
| Emulator UI | 4000 | Web dashboard |

**Prerequisites**: Java 21+ (required by Firestore emulator)

**Key configuration**: `libs/firebase/database/src/lib/utilities/database.config.ts` sets `preferRest: !useEmulator`. The Firestore REST transport tries OAuth authentication which fails against the emulator — gRPC (the default when `preferRest` is false) works correctly with the emulator.

The `FIRESTORE_EMULATOR_HOST` and `FIREBASE_AUTH_EMULATOR_HOST` environment variables are set automatically by `firebase emulators:exec`. The `firebase-admin` SDK detects these and routes traffic to the local emulators instead of production.

## Firebase CLI Multi-Account (Maple & Spruce + Mountain SOL)

This machine also works on the Mountain SOL platform, which uses a **different Google account**. The Firebase CLI keeps a **global default account** plus an optional **per-directory override** (keyed by the directory containing `firebase.json`), so both projects can be used in parallel terminals without logging in/out.

Setup in use here:

- **Global default** = `katie@mapleandsprucefolkarts.com` → this repo and **all `maple-and-spruce-*` worktrees** use it automatically, no per-directory pinning needed.
- The Mountain SOL repo (`~/GitHub/platform`) is pinned to `david@mountainsol.org` via `firebase login:use` run *inside* that repo.

Useful commands:

```bash
firebase login:add                  # log into an additional Google account (one-time)
firebase login:list                 # inside a repo: shows that dir's active account
firebase deploy --account <email>   # one-off override that mutates no state
```

**Caveat**: running `firebase login:use <email>` from a non-project directory (e.g. `~`) changes the **global** default and would flip every Maple & Spruce worktree to that account. Only pin Mountain SOL from *inside* its repo; leave `katie@` as the global default so all the Maple worktrees keep working. Verify the global default with `firebase login:list` from a directory that has no `firebase.json`.

## gcloud CLI Multi-Account

gcloud (like Firebase) is shared with the Mountain SOL platform under a **different Google account**. Unlike Firebase, gcloud has **no per-directory pinning** — the active configuration is global state and would race between parallel terminals. Use **named configurations** + the `CLOUDSDK_ACTIVE_CONFIG_NAME` env var per shell.

Two named configs are set up:

| Config | Account | Default project |
|--------|---------|-----------------|
| `maple` | `katie@mapleandsprucefolkarts.com` | `maple-and-spruce-dev` |
| `mountainsol` | `david@mountainsol.org` | `mountain-sol-platform-dev` |

Pin a shell (no races, overrides global state):

```bash
export CLOUDSDK_ACTIVE_CONFIG_NAME=maple          # this repo + all worktrees
gcloud <cmd> --configuration=maple                # or one-off per command
gcloud config configurations list                 # list configs (env var wins over IS_ACTIVE)
```

Switch a config to prod with `gcloud config set project maple-and-spruce --configuration=maple`, or pass `--project` per command.

**Auth note**: `gcloud auth login <email>` is separate from selecting a config; tokens occasionally need an interactive re-login.

**ADC caveat**: Application Default Credentials (used by Admin SDKs / client libraries, not `gcloud` itself) live in **one shared file**, so only one account's ADC is active at a time. For parallel ADC use `GOOGLE_APPLICATION_CREDENTIALS` (service-account JSON) or a separate `CLOUDSDK_CONFIG` dir per shell.

**Claude Code auto-selects the config**: `.claude/settings.local.json` (personal, gitignored) sets `env.CLOUDSDK_ACTIVE_CONFIG_NAME = "maple"`, so every Bash call Claude makes in this repo uses the Maple & Spruce gcloud account/project automatically. Keep that file out of git (it's machine-specific) — if it ever shows as tracked, run `git rm --cached .claude/settings.local.json`.

## Storage Bucket CORS

Storage bucket CORS is **manual, per-project console/CLI state** — it is not covered by `firebase deploy`, not in `storage.rules`, and not recreated by CI. If a project's bucket is ever recreated, this has to be re-applied by hand or the admin portal silently stops rendering stored files.

**Why it's needed**: `getSignedAgreement` returns V4 signed URLs on `storage.googleapis.com` (`get-signed-agreement.ts`). The admin portal fetches those cross-origin to render the signature image and agreement PDF, so the bucket must allow `GET` from the browser. Without it the detail view loads but the file silently fails to render.

The config lives in `cors.json` at the repo root — read-only (`GET`), which is all a signed-URL fetch needs. The URL itself carries the authorization and expires, so the wildcard origin grants nothing without a valid signature.

| Project | Bucket | CORS applied |
|---------|--------|--------------|
| Prod | `maple-and-spruce.firebasestorage.app` | Yes (manually, 2026-04-22) |
| Dev | `maple-and-spruce-dev.firebasestorage.app` | **No** — see below |

```bash
# read current config
gcloud storage buckets describe gs://<bucket> --format='value(cors_config)'

# apply / re-apply
gcloud storage buckets update gs://<bucket> --cors-file=cors.json
```

**Dev is intentionally flagged, not fixed**: dev's bucket has no CORS config, so signed-URL rendering that works in prod can fail locally and in the dev app. Applying the same file to dev is a one-liner (above) but it's a live infra change, so it's left as a deliberate decision rather than something a doc PR does silently.

**Use `gcloud storage`, not `gsutil`**: the equivalents are `gsutil cors get/set`, but Google unbundles `gsutil` from the gcloud CLI in **March 2027** (it will need a separate PyPI install with its own auth). Nothing in this repo uses `gsutil`; keep it that way.

## Never Commit

- Firebase service account keys
- API keys or tokens (Square, Etsy, etc.)
- `.secret.local` files
- `.env` files containing tokens
