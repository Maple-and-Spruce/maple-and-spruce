# Going public again: the history-rewritten repo

> One-off runbook, 2026-09. Once every box below is ticked, this file can move to
> `docs/sessions/history/`.

## Why a new repo

The repo was public, which kept GitHub Actions minutes free. Real customer data got into
tests and docs (#798, #835, #838), so it was taken private. #857 scrubbed the files, PR
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
  identifying string from the leak window was swapped for the invented stand-in #857 had
  already chosen. That covered full names, first names used as ids (`slot('<name>')`,
  `cus_<name>`), standalone surnames and real card last-4s. The replacement list lived only
  in a scratch directory.
- **Verified** on the rewritten history (543 commits):
  - no roster full name, customer email or customer phone number in any commit, and none
    of the leaked single names
  - gitleaks: 6 findings, all benign (Firebase web API keys, which are public by design,
    and test tokens)
- **The current tree differs from the old `main` in two files.** The #857 scrub had missed
  the real card last-4s and two first names inside `cus_` ids in
  `link-student-card.spec.ts` and `PaymentMethodCard.stories.tsx`. Both now use invented
  values, and both still pass (square integration suite 65/65, Storybook play 8/8).
- **Pushed to `david-shortman/maple-and-spruce-clean`**, private, `main` only. Every
  workflow skipped there because the repository guards name
  `david-shortman/maple-and-spruce`, so nothing deployed.

## Remaining steps

Do these in order. Until step 4, don't merge anything into the old repo; any merge must be
ported across (cherry-pick onto the new history, since the trees differ only in the two
files above).

1. [ ] Merge the PII safeguards PR in the new repo.
2. [ ] `gh secret set CUSTOMER_NAMES -R david-shortman/maple-and-spruce-clean < .customer-names.local`
3. [ ] Recreate the other Actions secrets (`gh secret list` on the old repo shows the
       names; the values come from their sources), the `production` environment with its
       required reviewer, and branch protection on `main`.
4. [ ] **Swap names:** rename the old repo to `maple-and-spruce-archive`, then rename
       `maple-and-spruce-clean` to `maple-and-spruce`. The workflows' repository guards
       name `david-shortman/maple-and-spruce` (26 of them), and a mismatch makes jobs skip
       while the run still shows green.
5. [ ] Reconnect Vercel (both projects) and Chromatic to the new repo. Check Dependabot
       and the Claude GitHub app.
6. [ ] Re-point local clones: `git remote set-url origin https://github.com/david-shortman/maple-and-spruce.git`,
       then `git fetch && git reset --hard origin/main` on a **clean** `main`. Rebase
       in-flight branches with `git rebase --onto origin/main <old-base> <branch>`.
       Their old base commits don't exist in the new history.
7. [ ] Recreate open issues. GitHub won't transfer them from a private repo to a public
       one. Script it with `gh issue create`; the Claude hook checks each body on the
       way in.
8. [ ] Settings → Actions → "Require approval for all outside collaborators" for fork PRs.
9. [ ] Flip to **public**. Watch the first CI run: the `customer-pii` job should report
       "N roster name(s)".
10. [ ] Later, once nothing needs the old PR discussions, **delete**
        `maple-and-spruce-archive`. It's private with no forks, so deleting it removes the
        old refs without needing GitHub support.
