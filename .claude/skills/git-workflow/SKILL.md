---
name: git-workflow
description: Branch naming, commit conventions, PR process, and issue tracking workflow. Use when creating branches, commits, or PRs.
---

# Git Workflow

## When to Use

Use this skill when creating branches, making commits, creating pull requests, or working with GitHub issues.

## Branch Protection

`main` branch is protected. All changes must go through pull requests.
- Direct pushes to `main` are blocked
- All work happens on feature branches
- PRs required even for solo development

## Branch Naming

```bash
git checkout main
git pull origin main
git checkout -b feature/{issue-number}-{short-description}
```

Patterns:
- `feature/[issue-number]-[short-description]`
- `fix/[issue-number]-[short-description]`
- `chore/[description]`

## Always Branch Off (and Verify Against) a Fresh `origin/main`

**The local `main` checkout — and any `maple-and-spruce-*` worktree — can be far behind `origin/main`.** This repo moves fast and the local working copy is often not pulled. Merged work (Cloud Functions, domain entities, admin UI) will be *missing* from a stale local tree, which silently sends work down the wrong path — e.g. rebuilding something already merged, or a subagent reporting that merged code "doesn't exist" because it read the stale checkout.

**Rules:**
1. **`git fetch origin main` first**, and base new branches/worktrees on `origin/main`, not local `main`:
   ```bash
   git fetch origin main
   git worktree add -b feature/{n}-{desc} ../maple-and-spruce-{desc} origin/main
   # or, in-repo:  git checkout -B work origin/main
   ```
2. **To check whether code exists or a PR is merged, inspect `origin/main` — never the local worktree:**
   ```bash
   git ls-tree -r origin/main --name-only | grep <file>
   git show origin/main:<path>
   git log origin/main --oneline | grep <topic>
   ```
   Do not rely on `ls` or `git log HEAD` in a possibly-stale local checkout.
3. **The many `feat/*` sibling worktrees may be stale duplicates of already-merged work** — diff against `origin/main` before assuming a branch still needs a PR.
4. **When spawning subagents (Explore or implementation), tell them explicitly:** _"run `git fetch origin main` first; the local main worktree may be stale; verify code presence and branch off `origin/main`."_

## Commit Conventions

**Format:**
```
<type>: <short description>

[optional body]

[Fixes #123]
```

**Types:** `feat`, `fix`, `refactor`, `docs`, `chore`, `test`

**Rules:**
1. Commit frequently with small, focused commits
2. Describe what and why
3. Reference issues with `#issue-number`

**Examples:**
```bash
git commit -m "feat: add artist creation form (#2)"
git commit -m "fix: correct commission calculation (#5)"
```

## Pull Request Process

```bash
git push -u origin feature/{branch-name}
gh pr create --title "feat: description (#issue)" --body "..."
```

**PR template:**
```markdown
## Summary
[Brief description]

## Changes
- [Change 1]
- [Change 2]

## Testing
- [ ] Tested locally

Closes #[issue-number]
```

## Working with Issues

### Before Starting Work
1. Check GitHub issues: `gh issue list`
2. Create or find an existing issue
3. Create feature branch referencing the issue
4. Reference issue in commits and PR (`Closes #XX`)

### Creating Issues
```bash
gh issue create \
  --title "Bug: description" \
  --label "bug,phase-X" \
  --body "## Description..."
```

### Issue Labels
- `phase-1` through `phase-5`: Phase-specific work
- `epic`: Large feature area

## Checklists

### Before Committing
- [ ] On feature branch (not main)
- [ ] Code follows patterns doc
- [ ] No credentials committed
- [ ] TypeScript compiles
- [ ] Commit references issue

### Before PR
- [ ] Commits pushed
- [ ] PR description complete
- [ ] Issue referenced
- [ ] Self-reviewed diff

### Before Merge
- [ ] PR approved (or self-reviewed)
- [ ] No conflicts
- [ ] CI passes
