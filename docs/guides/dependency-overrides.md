# Dependency Override Management

How to handle `pnpm audit` vulnerabilities and maintain the `overrides:` block in `pnpm-workspace.yaml`.

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

Overrides live in `pnpm-workspace.yaml` under the top-level `overrides:` key (pnpm v10+ convention — not in `package.json`). When an override is necessary:

1. Add the override entry under `overrides:` in `pnpm-workspace.yaml`
2. Add one or more `#` comment lines **immediately above** the entry with:
   - The advisory ID (e.g., `GHSA-xxxx-xxxx-xxxx`)
   - A brief description of the vulnerability
   - Which top-level package(s) pull in the vulnerable transitive dep
   - The date added (e.g., `Added 2026-04-01`)
3. Run `pnpm install` to apply the override and regenerate `pnpm-lock.yaml`
4. **Commit BOTH `pnpm-workspace.yaml` AND `pnpm-lock.yaml` in the same PR.** CI and Vercel install with `--frozen-lockfile`; an `overrides:` change with no matching lockfile update will fail with `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` before any code runs.
5. Run `pnpm audit --audit-level=high` to verify

### Override syntax

```yaml
overrides:
  # GHSA-xxxx-xxxx-xxxx: short summary of the vuln. Transitive dep of <parent
  # packages>. Added YYYY-MM-DD.
  lodash: '>=4.18.0'

  # GHSA-yyyy-yyyy-yyyy: only the 5.x line is vulnerable; pin to the patched
  # 5.x release rather than bumping to 6.x. Transitive dep of <parents>. Added YYYY-MM-DD.
  brace-expansion@^5: '>=5.0.5'

  # GHSA-zzzz-zzzz-zzzz: only a narrow version range is vulnerable. Added YYYY-MM-DD.
  picomatch@>=4.0.0 <4.0.4: '>=4.0.4'
```

Use scoped overrides (`pkg@<range>`) when only some version ranges are vulnerable; use a bare `pkg:` entry when every resolved version needs the bump.

## Cleaning Up Overrides

Overrides should be reviewed periodically (e.g., when updating Nx or other major deps):

1. **Check if the override is still needed**:
   ```bash
   # Temporarily remove the entry (and its comment) from pnpm-workspace.yaml, then:
   pnpm install
   pnpm audit --audit-level=high
   ```
2. **Check if the parent package now declares a safe range**:
   ```bash
   pnpm why <overridden-package>
   # If all resolved versions are already safe, the override can be removed
   ```
3. **Remove the override entry AND its `#` comment lines** from `pnpm-workspace.yaml`
4. Run `pnpm install && pnpm audit` to confirm; commit both `pnpm-workspace.yaml` and `pnpm-lock.yaml`

### When to review

- After any Nx version bump (many overrides trace to `@nx/*` transitive deps)
- After updating `firebase-tools` (another common source)
- When `pnpm audit` reports no vulnerabilities — some overrides may be redundant
- At least once per quarter

## Automation

- **New vulnerabilities** — Dependabot alerts are enabled at the repo level. `.github/workflows/dependabot-alert-to-claude.yml` runs daily and files an `@claude`-tagged issue per new high+critical alert; `.github/workflows/claude.yml` picks the issue up and opens a draft PR following this guide.
- **Stale overrides** — `.github/workflows/check-pnpm-overrides.yml` runs monthly. It temporarily removes each entry, re-runs `pnpm audit`, and opens a PR if any override is no longer needed.
- **CI belt-and-suspenders** — the `security` job in `build-check.yml` keeps running `pnpm audit --audit-level=high` on every PR so a regression can't merge unnoticed.

## Notes

- The `overrides:` key in `pnpm-workspace.yaml` is the supported location in pnpm v10+. The older `pnpm.overrides` block in `package.json` is **not** used in this repo.
- Comments live as `#` YAML lines directly above each entry (no separate `overridesComments` map — that was the package.json-era convention).
- All current overrides are for **transitive dev dependencies** — they don't affect the production bundle deployed to Firebase.
- Prefer `>=` minimum version over exact pinning so patches flow through naturally.
