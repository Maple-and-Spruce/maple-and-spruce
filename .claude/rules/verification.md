---
globs:
  - "libs/**"
  - "apps/**"
---

# Verification Workflow

A feature isn't done when it compiles — it's done when you've **seen it work**. Layer verification to match the surface you touched, and look at the result with your own eyes (Chrome / Storybook), not just green tests. The goal: be confident the experience works *without a human having to exercise it*.

## Layers — add the ones that apply to what you changed

1. **Unit** — every change to a function / util / component. `vi.mock()` repositories + external services (ADR-017). Aim for ~85% coverage on new code (`docs/reference/code-standards.md`). This is the floor, never the whole story.
2. **Integration** — any Cloud Function that touches Firestore, Square, Webflow, or payments. Real emulators + per-service mock servers (ADR-027). Run `./tools/run-integration-tests.sh [suite]`. Lock in the **user-facing contract**, not the status quo — don't defer to existing gaps.
3. **Interaction (Storybook `play`)** — any React UI. A `.stories.tsx` with a `play` fn that fills the form / clicks the control / asserts the outcome. Verifies render + flow headlessly (no auth/emulator). App-local stories under `app/(admin)/…` are picked up by `apps/maple-spruce/.storybook`.
4. **E2E** — once a feature is assembled, one happy-path run through the real flow.

## Look at it (do not skip this)

Tests prove logic; they don't prove it *looks and feels right*. While developing:

- **Storybook** is the fastest auth-free way to see a component render and drive it — `pnpm storybook`.
- **Chrome (chrome-devtools MCP)** to drive the running app or a live page and inspect real behavior, network, and layout. The `local-development` skill covers running locally (the functions emulator is required for the admin gate) and the Chrome-profile gotchas.
- For public Webflow pages, use Designer **Preview** or the staging URL.

Prefer building to **realize the experience** through real feedback over shipping on unit tests alone. If a change has a runtime surface, exercise that surface before calling it done.

See also: the `local-development` skill, `docs/reference/code-standards.md`, ADR-017 (unit mocking), ADR-027 (integration harness).
