# Working in a Git Worktree

A git worktree is a second checkout of the repo at a sibling path, sharing
`.git` with the main tree. Worktrees let you (or a coding agent) work on a
feature branch without disturbing the main checkout — parallel to dev and
test work already in progress there.

This repo is configured so that emulators, mock servers, and integration
tests can run in two or more trees at once without colliding.

## Location: keep worktrees OUTSIDE the repo tree

Worktrees live in a sibling directory next to the repo, **not** nested inside
it: `../maple-and-spruce-worktrees/<name>` (i.e. `<repo>-worktrees/<name>`),
not `.claude/worktrees/<name>`. Nesting worktrees inside the repo's own working
tree confuses tooling (git status, coverage globs, file watchers) and clutters
the checkout.

- **Claude Code agents**: `EnterWorktree` places worktrees in the external dir
  automatically via the `WorktreeCreate` hook wired in `.claude/settings.json`
  (`tools/claude-worktree-create.sh` / `tools/claude-worktree-remove.sh`). No
  action needed — new worktrees land in `<repo>-worktrees/` on branch
  `worktree-<name>`, and removing one also deletes that branch.
- **Manual `git worktree add`**: target the external dir yourself (see below).

Existing `.claude/worktrees/*` trees are fine to leave in place; they age out as
their branches merge. This is a forward-only convention — don't relocate a
worktree that has live work.

## Quick start

```bash
# From the main checkout
git fetch origin main
git worktree add -b feature/my-change ../maple-and-spruce-worktrees/my-change origin/main
cd ../maple-and-spruce-worktrees/my-change

# Bootstrap: deterministic port offset + NX_DAEMON=false
./tools/bootstrap-worktree.sh
source .env.worktree

pnpm install --frozen-lockfile
```

### Skip install: symlink main's `node_modules`

If the worktree's `pnpm-lock.yaml` matches main, you can skip the install
entirely and symlink main's `node_modules`:

```bash
./tools/bootstrap-worktree.sh --link-node-modules
```

The flag refuses (and tells you to run `pnpm install` instead) if any of
`pnpm-lock.yaml`, `package.json`, or `pnpm-workspace.yaml` differ from
main — running with a mismatched tree silently loads wrong dep versions.
If you later bump a dep in the worktree, remove the symlink and run
`pnpm install --frozen-lockfile`.

Caveat: `pnpm install` in main mutates the shared tree while you're using
it. If you're about to run long-lived processes (dev server, emulators),
don't run installs in main at the same time.


## What already works per-worktree

Nothing to configure for these — each worktree gets its own:

- `node_modules` (pnpm, `nodeLinker: hoisted`)
- `.nx/cache`, `dist/`, `.next/`, `coverage/`, `storybook-static/`
- `.firebase/` emulator state, `firestore-debug.log`
- `.env.dev` / `.env.prod` (committed, so a fresh worktree has them)
- `gh` auth, `gcloud` auth (user-level, shared by design)

## What needs port isolation

These ports are hardcoded in the repo's defaults. The
`EMULATOR_PORT_OFFSET` env var shifts all of them together so two trees can
run emulators simultaneously.

| Service           | Default | With `OFFSET=10` |
| ----------------- | ------- | ---------------- |
| Functions         | 5001    | 5011             |
| Firestore         | 8080    | 8090             |
| Auth              | 9099    | 9109             |
| Emulator UI       | 4000    | 4010             |
| Mock HTTP server  | 9999    | 10009            |

`tools/bootstrap-worktree.sh` picks an offset deterministically from the
branch name (`cksum` → mod 500 → ×10 + 10), so the same branch always
uses the same offset across machines. 500 slots keeps collisions rare
(~28 simultaneous branches to a 50% birthday-collision chance).

### Running integration tests in a worktree

```bash
source .env.worktree
./tools/run-integration-tests.sh
```

The script reads `EMULATOR_PORT_OFFSET` and:

- Kills only its own shifted ports (leaves other worktrees' emulators
  alone).
- Generates `firebase.worktree.json` (gitignored) with shifted emulator
  ports and passes it via `firebase --config`.
- Writes `SQUARE_BASE_URL` / `WEBFLOW_BASE_URL` in the per-codebase `.env`
  files to point at the shifted mock server.
- Exports `EMULATOR_PORT_OFFSET` down to the test processes so
  `EMULATOR_CONFIG` in `libs/firebase/integration-test-utils/` resolves the
  same shifted hosts.

### Running the Next.js dev server in a worktree

`nx dev maple-spruce` defaults to port 3000. For two trees at once, pass a
port and tell the client where the emulator is:

```bash
source .env.worktree
npx nx dev maple-spruce --port $((3000 + EMULATOR_PORT_OFFSET))
```

`getMapleFunctions()` in `libs/ts/firebase/firebase-config/` reads
`NEXT_PUBLIC_FUNCTIONS_EMULATOR_PORT` (set by the bootstrap script) so the
browser connects to the right functions emulator.

## Cleanup

```bash
# From the main checkout
git worktree remove .claude/worktrees/my-change
git branch -D feature/my-change  # if you want to drop the branch too
```

`.claude/worktrees` is gitignored, so orphaned directories there never
pollute commits — but `git worktree prune` is the clean way to reconcile.

## Firebase hub/logging ports: harmless auto-increment

The Firebase CLI starts an internal hub (default 4400) and logging port
(4500) that aren't exposed in `firebase.json`'s `emulators` section. When
you run a second emulator suite, the CLI auto-increments them to 4401 /
4501 and prints:

```
⚠  emulators: It seems that you are running multiple instances of the
   emulator suite for project maple-and-spruce-dev. This may result in
   unexpected behavior.
```

This warning is paranoid but harmless for the per-worktree case —
verified: both trees serve independent Firestore data on their shifted
ports. Ignore the warning.

## Troubleshooting

- **"Missing .env.dev"** — you likely ran the bootstrap from a path where
  the worktree hasn't checked out yet. `cd` into the worktree root first.
- **"Address already in use" on an emulator port** — another tree or stale
  process holds it. Re-run the bootstrap (offsets are deterministic; ports
  won't change), then `lsof -ti:<port> | xargs kill -9`.
- **Nx daemon confusion** — `NX_DAEMON=false` in `.env.worktree` sidesteps
  this. If you see weird caching across trees, confirm it's sourced.
