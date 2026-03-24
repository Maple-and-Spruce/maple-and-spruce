---
name: create-cloud-function
description: Step-by-step procedure for creating a new Firebase Cloud Function in the Nx monorepo. Use when adding a new function.
---

# Create a New Cloud Function

## When to Use

Use this skill when you need to add a new Firebase Cloud Function to the project. CI/CD will NOT deploy your function if the naming pattern is wrong.

## Instructions

Follow these steps exactly:

### 1. Copy an existing function library

```bash
# DO NOT use nx generate - it creates wrong structure
cp -r libs/firebase/maple-functions/get-artists libs/firebase/maple-functions/{my-new-function}
```

### 2. Update project.json

```json
{
  "name": "firebase-maple-functions-{my-new-function}",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/firebase/maple-functions/{my-new-function}/src",
  "projectType": "library",
  "tags": ["scope:firebase", "type:feature"],
  "targets": {}
}
```

The project name **MUST** follow the pattern `firebase-maple-functions-{function-name}`. This is required for CI/CD detection.

### 3. Update tsconfig.lib.json

Point `include` to the new source directory.

### 4. Create the function

Write your function in `src/lib/{my-new-function}.ts`.

### 5. Add path alias to tsconfig.base.json

```json
"@maple/firebase-maple-functions/{my-new-function}": [
  "libs/firebase/maple-functions/{my-new-function}/src/index.ts"
]
```

### 6. Choose the correct codebase and export

Determine which codebase your function belongs to based on its dependencies:
- **Square SDK** → `apps/functions-square/src/index.ts` (codebase: `maple-square`)
- **ical-generator** → `apps/functions-calendar/src/index.ts` (codebase: `maple-calendar`)
- **webflow-api** → `apps/functions-sync/src/index.ts` (codebase: `maple-sync`)
- **Everything else** → `apps/functions/src/index.ts` (codebase: `maple-core`, default)

Add the export to the correct entry point:

```typescript
export { myNewFunction } from '@maple/firebase-maple-functions/{my-new-function}';
```

If the function is NOT in `maple-core`, add a mapping in `function-codebases.json`:

```json
"firebase-maple-functions-{my-new-function}": "maple-{codebase}"
```

### 7. Validate

```bash
npx nx show projects | grep firebase-maple-functions-{my-new-function}
```

## Common Mistakes

- **Wrong**: `my-new-function` (no prefix, CI won't deploy)
- **Wrong**: `maple-functions-my-new-function` (wrong prefix, CI won't deploy)
- **Correct**: `firebase-maple-functions-my-new-function`

## Post-Creation

After creating the function:
1. Add unit tests using `vi.mock()` to mock repositories (see ADR-017)
2. Update `docs/reference/deployed-functions.md` with the new function
3. Update `docs/reference/implementation-status.md` if part of a tracked feature
