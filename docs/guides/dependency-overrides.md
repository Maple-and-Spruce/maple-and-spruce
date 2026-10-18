# Dependency Override Management

How to handle `pnpm audit` vulnerabilities and maintain the `overrides:` block in `pnpm-workspace.yaml`.

---

## Strategy: Re-resolve, Then Update Top-Level

### Step 0: is the lockfile just stale?

A lockfile keeps every transitive version it once picked, even after the parent
has moved to a patched range. `pnpm update` and ordinary installs leave those
entries alone. On 2026-09-29 a fresh resolve cleared ~45 of the 50 overrides
this repo carried: the fixes had shipped upstream months earlier and nothing had
re-resolved them. So before adding an override, re-resolve:

```bash
rm -rf node_modules pnpm-lock.yaml   # BOTH — pnpm 11+ keeps a lockfile copy in
                                     # node_modules and reuses it ("Already up to date")
pnpm install
pnpm audit --audit-level=high
```

Changing `overrides:` makes pnpm ask to purge `node_modules`, which hangs a
non-interactive shell. Use `CI=true pnpm install --config.confirm-modules-purge=false`.

Whatever is still flagged after that is pinned by its parent. Check which parent
with `pnpm why <pkg>`, then continue below.

### Then update the top-level dependency

Try to fix what's left by updating direct dependencies before adding overrides:

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

1. **Check if the override is still needed**. The fastest way is to remove
   *all* of them and re-resolve (Step 0 above), then add back only what the
   audit still flags. Removing one entry and running a plain `pnpm install` is
   not a real test, because the lockfile keeps the version the override forced:
   ```bash
   # Remove the overrides: block from pnpm-workspace.yaml, then:
   rm -rf node_modules pnpm-lock.yaml
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
- **Stale overrides** — review **manually** using the steps under "Cleaning Up Overrides" above. A previous attempt at an automated `mfranzke/check-pnpm-overrides` workflow was removed because its in-action audit didn't match our CI audit and it proposed removing currently-load-bearing entries (including a critical-severity fix).
- **CI belt-and-suspenders** — the `security` job in `build-check.yml` keeps running `pnpm audit --audit-level=high` on every PR so a regression can't merge unnoticed.

## Notes

- The `overrides:` key in `pnpm-workspace.yaml` is the supported location in pnpm v10+. The older `pnpm.overrides` block in `package.json` is **not** used in this repo.
- Comments live as `#` YAML lines directly above each entry (no separate `overridesComments` map — that was the package.json-era convention).
- All current overrides are for **transitive dev dependencies** — they don't affect the production bundle deployed to Firebase.
- Prefer `>=` minimum version over exact pinning so patches flow through naturally.
