# Dependency Override Management

How to handle `pnpm audit` vulnerabilities and maintain `pnpm.overrides` in `package.json`.

---

## Strategy: Update Top-Level First

Always try to fix vulnerabilities by updating direct dependencies before adding overrides:

1. **Run `pnpm audit`** to identify vulnerable packages and their paths
2. **Run `pnpm why <package>`** to find which top-level dependency pulls it in
3. **Check if the top-level dep has an update** that resolves the transitive vulnerability:
   ```bash
   pnpm outdated <top-level-package>
   ```
4. **Update the top-level dep first**:
   ```bash
   pnpm update <top-level-package>
   ```
5. **Re-run `pnpm audit`** — if the vulnerability is gone, you're done
6. **Only add an override** if the top-level package hasn't updated its dependency range

## Adding an Override

When an override is necessary:

1. Add the override to `pnpm.overrides` in `package.json`
2. Add a comment entry to `pnpm.overridesComments` with:
   - The advisory ID (e.g., `GHSA-xxxx-xxxx-xxxx`)
   - A brief description of the vulnerability
   - Which top-level package(s) pull in the vulnerable transitive dep
   - The date added (e.g., `Added 2026-04-01`)
3. Run `pnpm install` to apply the override and regenerate `pnpm-lock.yaml`
4. **Commit BOTH `package.json` AND `pnpm-lock.yaml` in the same PR.** CI and Vercel install with `--frozen-lockfile`; a `pnpm.overrides` change with no matching lockfile update will fail with `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` before any code runs.
5. Run `pnpm audit --audit-level=high` to verify

### Override syntax

```jsonc
{
  "pnpm": {
    "overrides": {
      // Simple: override all versions
      "lodash": ">=4.18.0",
      // Scoped: only override specific version ranges
      "picomatch@>=4.0.0": ">=4.0.4",
      "brace-expansion@^5": ">=5.0.5"
    }
  }
}
```

Use scoped overrides (`pkg@range`) when the package appears across multiple major version ranges and only some are vulnerable.

## Cleaning Up Overrides

Overrides should be reviewed periodically (e.g., when updating Nx or other major deps):

1. **Check if the override is still needed**:
   ```bash
   # Temporarily remove the override from package.json, then:
   pnpm install
   pnpm audit --audit-level=high
   ```
2. **Check if the parent package now declares a safe range**:
   ```bash
   pnpm why <overridden-package>
   # If all resolved versions are already safe, the override can be removed
   ```
3. **Remove the override AND its comment** from both `overrides` and `overridesComments`
4. Run `pnpm install && pnpm audit` to confirm

### When to review

- After any Nx version bump (many overrides trace to `@nx/*` transitive deps)
- After updating `firebase-tools` (another common source)
- When `pnpm audit` reports no vulnerabilities — some overrides may be redundant
- At least once per quarter

## Automation

- **New vulnerabilities** — Dependabot alerts are enabled at the repo level. When an alert fires, assign it to an AI agent from the Security → Dependabot tab (or the Agents tab). The agent reads this guide and opens a draft PR with either a top-level update or a scoped override.
- **Stale overrides** — `.github/workflows/check-pnpm-overrides.yml` runs monthly. It temporarily removes each entry, re-runs `pnpm audit`, and opens a PR if any override is no longer needed.
- **CI belt-and-suspenders** — the `security` job in `build-check.yml` keeps running `pnpm audit --audit-level=high` on every PR so a regression can't merge unnoticed.

## Notes

- `overridesComments` is not a pnpm feature — it's a documentation convention stored as a sibling key. pnpm ignores unknown keys under `pnpm`.
- All current overrides are for **transitive dev dependencies** — they don't affect the production bundle deployed to Firebase.
- Prefer `>=` minimum version over exact pinning so patches flow through naturally.
