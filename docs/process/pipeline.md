# The backlog pipeline

How the backlog keeps moving without David having to push it, and how
nothing reaches a customer or Katie without the two of them saying yes.

**Status: proposed by David, 2026-11-07.** Adapted from the Everything Morgantown
pipeline. Only David changes this page (see "Changing the process").

## Why it looks like this

Merging to `main` deploys to production, with no approval step in between
(Firebase functions, the admin app on Vercel, the Webflow widgets). So for an
agent, **merging is shipping**. Everything Morgantown lets agents merge their own
PRs because a wrong page there is cheap to revert. Here a wrong change can charge
a family's card, email a customer, or change the screen Katie runs the shop from.

So agents keep the backlog moving, but each piece of work goes in a **lane** that
decides how far an agent may take it alone.

## Who does what

| Who | Does |
|---|---|
| **David** | Sets direction. Approves lanes, process changes, anything with money. Merges approval PRs. |
| **Katie** | Says yes or no to anything she or customers will see: turning a flag on, copy, prices, emails, how a screen works. |
| **Groomer** (daily routine) | Triages, scores and specs issues. Picks `up-next`. Closes what is already done. |
| **Builder** (daily routine) | Builds one `up-next` issue, opens the PR, merges it only through `tools/agent-merge.sh`. |
| **Retro** (weekly routine) | Writes the weekly retro and the Decisions page for David and Katie. |
| **Claude review** (`claude-review.yml`) | Second reader on every agent-built PR. |

Interactive Claude Code sessions follow the same rules when they pick up backlog
work on their own. When David asks for something directly in a session, his ask
wins and the lanes do not apply.

## Lanes

| Lane | What fits | The agent may |
|---|---|---|
| `lane:invisible` | CI, guards, tests, stories, mock servers, docs, `tools/` scripts, Firestore indexes | Build, review, merge |
| `lane:dark` | New behaviour in the admin app, widgets or functions, shipped **off** behind a Remote Config flag | Build, review, merge. Turning the flag on is a decision for David and Katie |
| `lane:approval` | Money, prices, copy people already read, emails, changes to how existing screens work, deleting product code, dependencies, CI and rules files, deploy shape | Build and open the PR, then stop. David merges |
| Never | See below | Nothing. File it as a `for:david` issue |

`tools/check-autonomy-lane.ts` (the **Autonomy lane** check) reads the diff and
fails an agent-built PR whose label is weaker than what it touches. It reads
paths, not meaning, so it is a floor. The Claude review is what checks that the
flag really hides the change.

**Money is always `lane:approval`.** Anything under Square, billing, charges,
invoices, payments, payouts, checkout, refunds, installments, discounts,
subscriptions, prices or Hope. However small, however well flagged.

### Dark launches

- **Flag names** are `agent_<issue>_<short_name>`, for example `agent_60_week_view`.
  The PR body names it on its own line: ``Flag: `agent_60_week_view` ``.
- **Read it with `useFeatureFlags()`** from `@maple/react/data`:
  `if (boolean('agent_60_week_view')) { ... }`. A parameter that does not exist in
  Remote Config reads as `false`, so a new flag is off everywhere until someone
  creates it.
- **With the flag off, nothing may differ.** Same screens, same emails, same
  function responses, same stored data. A new callable nothing calls yet is fine;
  a new Firestore field written regardless of the flag is not.
- **Server-side behaviour has no flag yet.** A change to what an existing function
  does is `lane:approval`. A brand-new function or route that only flagged UI
  calls is `lane:dark`, but it costs a line in the function-count baseline, which
  is a protected file, so in practice new functions are `lane:approval` too.
- **Agents never create or change a Remote Config parameter.** Turning a flag on
  goes on the Decisions page: dev first, so Katie can try it, then prod.
- **Flags get removed.** Two weeks after a flag goes on in prod, the Groomer files
  a cleanup issue. Removing it changes product code, so it is `lane:approval`; the
  Decisions page lists those as quick merges.

### Never, for an agent working on its own

- Publish or edit the Webflow site, or change Tally forms, MailerLite, Meta ads or
  Square settings
- Write to production Firestore, Square or Storage, or run a `tools/` script
  against production
- Create, change or read secrets; change Remote Config, Firebase or GCP settings
- Send anything to anyone outside the repo: customers, teachers, partners
- Merge a PR that is not its own, or merge any PR some other way than
  `tools/agent-merge.sh`
- Put real customer data in an issue, comment, PR, commit or fixture. Issue
  comments are public. Describe the shape or use a document id
  (`.claude/rules/customer-privacy.md`)

## Labels

| Label | Meaning |
|---|---|
| `idea` | Triaged, not yet scored |
| `up-next` | Specced and ready for the Builder. At most 3 at once |
| `in-progress` | Claimed. The claim comment says who and when |
| `blocked` | Waiting on something; a comment says what |
| `for:david` | Needs David: a decision, an approval, a login, a contact |
| `for:katie` | Needs Katie's yes. Shows on the Decisions page |
| `agent-built` | A PR an agent opened on its own |
| `lane:invisible`, `lane:dark`, `lane:approval` | The lane (issues and PRs) |
| `stale-check` | The Groomer thinks this may be done or obsolete; David confirms |
| `type:process` | A change to how we work. Always `for:david` |

## The stages

| # | Stage | Who | Output | Gate to move on |
|---|---|---|---|---|
| 1 | Intake | Anyone | An issue | Searched for duplicates first |
| 2 | Triage and score | Groomer | Score comment, lane label | Scored. Never-list items go to `for:david` instead |
| 3 | Spec | Groomer | "Done looks like" comment | All five parts below |
| 4 | Build | Builder | Branch, PR with `agent-built` and a lane | Local checks pass |
| 5 | Review | Autonomy lane + Claude review | Two check results | Both green |
| 6 | Ship | Builder, via `tools/agent-merge.sh` | Squash merge, which deploys | Only invisible and dark lanes |
| 7 | Turn on | David and Katie | A flag on in dev, then prod | Their yes on the Decisions page |
| 8 | Look back | Retro | Retro file, Decisions page | Proposals go to David |

### 2. Triage and score

The Groomer reads every new or changed open issue each day. The first run works
through the whole backlog, 15 issues a run, oldest first.

For each issue, one comment in this format (a script reads it later):

```
Score: 3.6 · lane:dark
Value 4 | Fit 4 | Evidence 3 | Effort 3 | Risk 3
Why: one or two sentences.
```

Each factor is 1 to 5, higher is better:

| Factor | 1 | 3 | 5 |
|---|---|---|---|
| **Value** | Nice to have | Saves Katie or Nathan time weekly, or removes a customer annoyance | Brings in revenue, or stops money or data going wrong |
| **Fit** with current goals | Unrelated to anything live | Supports a live program | Unblocks the current priority (see `docs/sessions/SESSION.md`) |
| **Evidence** | A hunch | A real occurrence or a request | Repeated, measured, or asked for by Katie |
| **Effort** (inverted) | Weeks, new infrastructure | A few days | One session |
| **Risk** (inverted) | Money, customer data, or a screen in daily use | Normal product code with tests | Tests, docs, tooling |

**Score = (2 × Value + 2 × Fit + Evidence + Effort + Risk) / 7**, to one decimal.

Hard rules on top of the number:

- **Evidence 1 is never `up-next`.** Research first.
- **Done or obsolete?** If the code or git history shows it is done, the Groomer
  comments with the evidence (PR, commit, file) and adds `stale-check`. David
  closes it, or says why not. After two weeks with no answer, the Groomer closes
  it with `state_reason: completed` or `not_planned` and links its comment.
- **Epics are not scored.** Their sub-issues are.

### 3. Spec

Before `up-next`, a comment answers:

1. **Who it is for** (Katie, Nathan, a teacher, a parent, a student, a visitor) and
   what they are trying to do.
2. **Done looks like:** what they can do afterwards.
3. **Lane**, and for `lane:dark` the flag name.
4. **How it will be verified:** which layers of `.claude/rules/verification.md`
   apply (unit, integration, Storybook `play`, e2e).
5. **What Katie will be asked**, for dark and approval work: one sentence she can
   say yes or no to.

At most **3** issues carry `up-next`. The Groomer prefers `lane:invisible` and
`lane:dark` work, because that is what can finish without a person; at most one
`up-next` may be `lane:approval`.

### 4. Build

- **Claim:** add `in-progress`, post a claim comment with the time, wait, reread.
  The earliest claim comment wins. Claims expire after 3 days without a linked PR.
- **One open agent-built PR at a time** per Builder, and at most two open
  `lane:approval` PRs waiting on David. If both are waiting, build invisible or
  dark work only.
- Branch `agent/<issue>-<short-name>` off a fresh `origin/main`.
- Follow `AGENTS.md`, `.claude/CLAUDE.md` and the rules in `.claude/rules/`, the
  same as any session. Run the checks those files require before pushing.
- **The PR body:** `Closes #N`, what changed and why, the lane, the flag line for
  dark work, how it was verified, and for dark and approval work a "What Katie
  will see" paragraph with a Storybook link or screenshot.
- Label the PR `agent-built` and its lane.

### 5. Review

Two checks run on every agent-built PR:

- **Autonomy lane** (`autonomy-lane.yml`): the label is at least as strong as the diff.
- **Claude review** (`claude-review.yml`): reads the diff against this page. For
  invisible work it asks whether anything a person sees changes. For dark work it
  asks whether, with the flag off, everything is exactly as before. It also checks
  for customer data, secrets, money, tests and project rules. A blocker turns it
  red. One comment per PR, edited on re-runs.

If the author thinks a blocker is wrong, it does not argue with the check. It
labels the PR `for:david` and says why. If the review fails to finish twice, same.

### 6. Ship

`tools/agent-merge.sh <pr>` is the only way an agent merges. It refuses unless
the PR is agent-built, invisible or dark, has no `for:*` / `blocked` /
`needs-review` label, and every check on the head commit passed, including both
gates. It squash-merges against that exact commit.

After merging, the Builder checks that the "Deploy on merge" run for that commit
went green. A red deploy becomes a `for:david` issue straight away.

### 7. Turn on

Dark work is done for the agent when it merges. It is done for the shop when
Katie has tried it in dev and David has turned it on in prod. The Decisions page
carries it until then.

### 8. Look back

**Weekly retro (Mondays).** The Retro routine writes
`docs/process/retros/YYYY-MM-DD.md` and opens it as a `lane:invisible` PR:

1. What shipped, by lane
2. What did not work: blockers, reverts, red deploys, wrong scores
3. Pipeline health: days from `up-next` to merge, PRs blocked by review and why,
   open approval PRs and their age, flags merged but not on, stale claims, any PR
   merged without both gates green
4. Stop doing: at least one thing, with evidence
5. Top 10 backlog by score
6. At most three process changes to propose, each as its own `type:process` PR

**The Decisions page.** The same run writes one page for David and Katie in the
Maple and Spruce Notion workspace, "Decisions — week of <date>", and a weekly
Apple reminder points David to it. Plain language, no jargon, no customer data,
grouped as:

- **Try these** (flags ready to turn on in dev, with what Katie will see)
- **Turn these on** (flags Katie has tried, ready for prod)
- **Approve these** (approval PRs, with what changes and the recommended answer)
- **Questions** (`for:david` and `for:katie` issues)
- **Closing these unless you say otherwise** (`stale-check` items)

Each item: one line on what it is, the recommended answer, and what happens if
nobody answers (usually: nothing ships, and it stays on next week's page).
Answers are recorded back on the GitHub issue or PR by whoever reads them next.

If the routine cannot reach Notion, it posts the same content as a GitHub issue
titled "Decisions — week of <date>" with `for:david`, and says so in its recap.

## Budget

- Groomer: 15 issues a run. Builder: one PR a day. Retro: once a week.
- Claude review only runs on agent-built PRs.
- `up-next` holds at most 3 issues; at most 2 approval PRs wait at once.

## Changing the process

- Any agent may propose a change: a PR editing this page, labelled `type:process`
  and `for:david`, with the problem, the evidence and how we will know in two
  weeks whether it helped.
- Only David merges changes to this page, `.github/`, `.claude/`, `AGENTS.md`,
  `tools/check-autonomy-lane.ts` and `tools/agent-merge.sh`. The Autonomy lane
  check treats them as `lane:approval`.
- Changes are trials: the retro two weeks later says keep, change or drop.
