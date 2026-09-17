# Going public again: the history-rewritten repo

> One-off runbook, 2026-09. Once every box below is ticked, this file can move to
> `docs/sessions/history/`.

## Why a new repo

The repo was public, which kept GitHub Actions minutes free. Real customer data got into
tests and docs (legacy #798, legacy #835, legacy #838), so it was taken private. legacy #857 scrubbed the files, PR
bodies and issues, but the data was still in the **file contents of older commits on
`main`**. It also survived in places only GitHub support can purge: PR refs
(`refs/pull/N/head`) and the edit history of issue and PR bodies. Flipping the old repo
back to public would republish all of it.

So `main` was rewritten and pushed to a **new** repository, which starts with no PR refs,
no issue edit history and no Actions logs.

## What was done (2026-09-16)

- **Roster built from prod** (students, contacts, leads, registrants, Music Together, Craft
  Club, signers) and kept outside the repo.
- **History rewritten** with `git filter-repo --replace-text` on a fresh clone. Every
  identifying string from the leak window was swapped for the invented stand-in legacy #857 had
  already chosen. That covered full names, first names used as ids (`slot('<name>')`,
  `cus_<name>`), standalone surnames and real card last-4s. The replacement list lived only
  in a scratch directory.
- **Verified** on the rewritten history (543 commits):
  - no roster full name, customer email or customer phone number in any commit, and none
    of the leaked single names
  - gitleaks: 6 findings, all benign (Firebase web API keys, which are public by design,
    and test tokens)
- **The current tree differs from the old `main` in two files.** The legacy #857 scrub had missed
  the real card last-4s and two first names inside `cus_` ids in
  `link-student-card.spec.ts` and `PaymentMethodCard.stories.tsx`. Both now use invented
  values, and both still pass (square integration suite 65/65, Storybook play 8/8).
- **Pushed to `david-shortman/maple-and-spruce-clean`**, private, `main` only. Every
  workflow skipped there because the repository guards named
  `david-shortman/maple-and-spruce`, so nothing deployed.
- **Moved into the org as `Maple-and-Spruce/maple-and-spruce`** (2026-09-16), still
  private. The personal account's Actions minutes were used up ("job was not started
  because … your spending limit needs to be increased"). The org has its own pool of
  2,000 private-repo minutes, and public repos get unlimited minutes on any owner. The
  repo had only gone personal because Vercel Hobby won't deploy a *private* org repo, and
  that stops mattering once it's public. The repository guards now name
  `Maple-and-Spruce/maple-and-spruce`.

## Remaining steps

Until step 5, don't merge anything into the old repo (`david-shortman/maple-and-spruce`).
Any merge must be ported across by cherry-picking onto the new history (the trees differ
only in the two files above).

1. [x] `CUSTOMER_NAMES` secret set (it moved with the repo).
2. [ ] Merge the PII safeguards PR (#1). Its guard change is what makes CI run here at all.
3. Actions secrets. GitHub never returns a secret's value, so each one is set again from its source:
   - [x] `SQUARE_SANDBOX_ACCESS_TOKEN`, `MT_SQUARE_SANDBOX_ACCESS_TOKEN`: from dev Secret Manager.
   - [x] `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VERCEL_PROJECT_ID_DEV`: from `vercel api /v10/projects`.
   - [x] `VERCEL_TOKEN`, `WEBFLOW_WORKSPACE_API_TOKEN`
   - [ ] `DEPENDABOT_READ_TOKEN`: #4
   - [ ] `CLAUDE_CODE_OAUTH_TOKEN`, or drop the automation: #5
   - [x] `CHROMATIC_PROJECT_TOKEN`: not needed; Chromatic is removed (#2).
   - [x] Dependabot alerts and security updates are enabled on this repo.
4. [ ] **GCP Workload Identity Federation:** the provider `attributeCondition` and the
       deployer service account's `principalSet` binding name the repo. Point both at
       `Maple-and-Spruce/maple-and-spruce` in the prod (`138840458966`) and dev
       (`1062803455357`) pools. Until then, deploy jobs fail at auth.
5. [ ] Rename the old repo to `maple-and-spruce-archive` so nothing confuses the two.
6. [ ] Reconnect Vercel and Chromatic, the Claude GitHub App (install it on the org), and
       the `DEPENDABOT_READ_TOKEN` PAT (resource owner: the org). Vercel Git previews
       need the repo to be public first, since Hobby refuses private org repos. Production
       deploys go through the Vercel CLI in Actions and don't depend on the Git link.
7. [ ] Re-point local clones: `git remote set-url origin https://github.com/Maple-and-Spruce/maple-and-spruce.git`,
       then `git fetch && git reset --hard origin/main` on a **clean** `main`. Rebase
       in-flight branches with `git rebase --onto origin/main <old-base> <branch>`.
       Their old base commits don't exist in the new history.
8. [ ] Recreate open issues. GitHub won't transfer them from a private repo to a public
       one. Script it with `gh issue create`; the Claude hook checks each body on the
       way in.
9. [ ] Org settings → Actions → require approval for fork PRs from outside
       collaborators. Once public, add branch protection or a ruleset on `main`.
10. [ ] Flip to **public**. Watch the first CI run: the `customer-pii` job should report
        "N roster name(s)", and the run should have jobs that actually ran, not a green
        run made entirely of skips.
11. [ ] Later, once nothing needs the old PR discussions, **delete**
        `maple-and-spruce-archive`. It's private with no forks, so deleting it removes the
        old refs without needing GitHub support.
