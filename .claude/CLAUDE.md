# Claude Code Configuration

> Claude-specific overrides, workflow instructions, and self-updating documentation lifecycle.

---

## Session Startup

1. Read `AGENTS.md` for project context and directives
2. Read `docs/sessions/SESSION.md` for current work status
3. Run `gh issue list` to check open issues

## Available Skills

| Skill | Trigger | Location |
|-------|---------|----------|
| `create-cloud-function` | Adding a new Firebase Cloud Function | `.claude/skills/create-cloud-function/` |
| `git-workflow` | Creating branches, commits, PRs | `.claude/skills/git-workflow/` |
| `local-development` | Running locally, troubleshooting | `.claude/skills/local-development/` |
| `session-management` | Updating docs, managing sessions | `.claude/skills/session-management/` |

Check for a matching skill before building workflows from scratch.

## Path-Specific Rules

Rules in `.claude/rules/` are auto-loaded when working on matching file paths:
- `firebase-functions.md` -- Applies to `libs/firebase/maple-functions/**`, `apps/functions/**`
- `react-components.md` -- Applies to `libs/react/**`, `apps/maple-spruce/src/components/**`

---

## Self-Updating Documentation Workflow

Documentation in this project is self-maintaining. Follow this lifecycle during every development task.

### READ (before coding)

Always:
- `AGENTS.md` and `docs/sessions/SESSION.md`

By task type:
- Feature work: `docs/reference/implementation-status.md`, `docs/reference/REQUIREMENTS.md`
- Pattern questions: `docs/architecture/PATTERNS-AND-PRACTICES.md`
- Architecture decisions: `docs/architecture/DECISIONS.md`
- Env/deployment: `docs/guides/environment-setup.md`, `docs/architecture/ci-cd.md`

### FIND (locating docs)

| What you need | Where to look |
|---------------|---------------|
| Procedural workflows | `.claude/skills/{name}/SKILL.md` |
| Path-specific rules | `.claude/rules/` (auto-loaded) |
| System design, ADRs | `docs/architecture/` |
| How-to guides | `docs/guides/` |
| Status/tracking/specs | `docs/reference/` |
| Session context | `docs/sessions/` |

### UPDATE (during and after coding)

| Event | File to update |
|-------|---------------|
| Feature started/completed | `docs/reference/implementation-status.md` |
| New Cloud Function added | `docs/reference/deployed-functions.md` |
| Session work completed | `docs/sessions/SESSION.md` |
| Architecture decision made | `docs/architecture/DECISIONS.md` (new ADR) |
| New code pattern established | `docs/architecture/PATTERNS-AND-PRACTICES.md` |
| New feature planned | `docs/reference/REQUIREMENTS.md` |
| Future idea captured | `docs/reference/BACKLOG.md` |

### CREATE (when new docs are needed)

| Doc type | Location | Required format |
|----------|----------|----------------|
| Procedural workflow | `.claude/skills/{name}/SKILL.md` | YAML frontmatter + instructions |
| Path-specific rule | `.claude/rules/{context}.md` | YAML globs + rules |
| Architecture doc | `docs/architecture/` | Markdown |
| How-to guide | `docs/guides/` | Markdown |
| Reference/tracking | `docs/reference/` | Markdown |

### ARCHIVE (end of session)

1. Update `docs/sessions/SESSION.md` with completed work and next steps
2. At milestones, archive to `docs/sessions/history/YYYY-MM-DD.md`

---

## Behavioral Rules

- **Never deploy** -- Never run `firebase deploy`. CI/CD handles deployment on merge to main.
- **Never read secrets** -- Never read `.secret.local`, `.env` files with tokens, or output API keys.
- **Testing mocks** -- Use `vi.mock()` to mock repositories and external services in Cloud Function tests (ADR-017).
- **No package.json in libs** -- If `nx generate` auto-creates one in a library, delete it.
- **Function naming** -- All Cloud Function libraries must be named `firebase-maple-functions-{name}` for CI/CD.

---

## Documentation Standards

This project follows the Repository AI Documentation Standards:

- `AGENTS.md` stays under 150 lines with portable project context
- `.claude/CLAUDE.md` (this file) has Claude-specific overrides and the doc lifecycle
- `.claude/skills/` holds reusable procedural knowledge (loaded on demand)
- `.claude/rules/` holds path-specific context (auto-loaded by glob match)
- `docs/architecture/` holds system design and ADRs
- `docs/guides/` holds how-to guides
- `docs/reference/` holds status tracking, specs, and standards

When extending documentation, follow these placement principles:
1. Is it project context or procedural knowledge? (AGENTS.md vs skill)
2. Is it portable across tools or Claude-specific? (AGENTS.md vs .claude/CLAUDE.md)
3. Is it always relevant or conditionally loaded? (AGENTS.md vs rule/skill)
