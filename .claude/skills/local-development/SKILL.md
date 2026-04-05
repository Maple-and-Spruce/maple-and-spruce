---
name: local-development
description: Running functions and web app locally, troubleshooting emulator issues, Storybook. Use when running or debugging locally.
---

# Local Development

## When to Use

Use this skill when running the web app or functions locally, troubleshooting emulator issues, or running Storybook.

## Important

The user runs functions and web app locally for testing. Claude writes code and creates PRs -- Claude does NOT deploy or run dev servers.

## Running Functions Locally (user runs this)

```bash
pnpm exec nx run functions:serve
```

This command:
1. Builds the functions
2. Copies `.env.dev` to `dist/apps/functions/.env`
3. Starts watch mode for rebuilds (background)
4. Runs `firebase serve --only functions --project=dev` on port 5001

## Running Web App Locally (user runs this)

```bash
pnpm exec nx run maple-spruce:dev
```

Runs on http://localhost:3000

## Running Storybook

```bash
pnpm exec nx run maple-spruce:storybook
# Opens http://localhost:6006
```

Building Storybook:
```bash
pnpm exec nx run maple-spruce:build-storybook
# Output: dist/storybook/maple-spruce
```

## Running Unit Tests

```bash
pnpm test
```

## Running Integration Tests (user runs this)

Integration tests run Cloud Functions against real Firebase emulators. Requires Java installed (for Firestore emulator).

**All-in-one** (builds functions, copies .env, starts emulators, runs tests, shuts down):
```bash
pnpm exec nx run functions-integration-tests:test-with-emulators
```

**Manual** (useful when iterating on tests — keep emulators running):
```bash
# Terminal 1: Build and start emulators
pnpm exec nx run functions:build
cp .env.dev dist/apps/functions/.env
firebase emulators:start --project=dev --only auth,firestore,functions

# Terminal 2: Run tests (repeat as needed)
pnpm exec nx run functions-integration-tests:test
```

Emulator ports: Auth (9099), Firestore (8080), Functions (5001), UI (4000)

## Deployment

User decides when to deploy to dev. Production deploys automatically via CI/CD on merge to main.

## Troubleshooting Local Functions

### Emulator prompts for environment variables

The Firebase emulator is not finding the `.env` file. This happens when:
- The build clears `dist/apps/functions/` before the `.env` is copied
- A stale watch process is interfering

**Fix:**
```bash
# Kill any stale processes
pkill -f "firebase serve"
pkill -f "nx run functions"

# Clean and restart
rm -rf dist/apps/functions
pnpm exec nx run functions:serve
```

**Why this happens:**
- Firebase reads `.env` from `dist/apps/functions/`
- The `nx run functions:build` clears this directory
- The serve command copies `.env.dev` after build, before starting the emulator
- If ordering is wrong or stale processes exist, the emulator starts without the `.env`

**Key indicator it's working:**
```
i  functions: Loaded environment variables from .env.
```
