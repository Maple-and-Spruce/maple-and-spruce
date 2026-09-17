---
globs:
  - "**"
---

# Never put real customer data anywhere we write

## The rule

**Real people's names, email addresses, phone numbers and addresses never appear in
anything this repo produces.** Not in code, not in tests, not in fixtures, not in
Storybook stories, not in commit messages, not in PR descriptions, not in issue bodies
or comments, not in docs.

This includes **children**, who make up much of the student roster.

It applies whether or not the repository is public. A PR description is read by anyone
with repo access, is mirrored into notifications and email, and is effectively permanent.

## Why this is a hard rule and not a preference

Families hand over a child's name, a parent's email and a card on file in order to take
music lessons. None of them consented to appearing in an engineering artefact. The
studio's obligation to them does not depend on whether the repo happens to be private
today.

It is also unrecoverable in a way most mistakes are not: an issue body can be edited, but
notification emails have already gone out.

## What to write instead

**Describe the shape, not the person.** The shape is what makes the case interesting;
the name adds nothing an engineer needs.

| Do not write | Write |
|---|---|
| naming a child and the parent on their card | "a child's card is in a parent's name" |
| naming an adult student and their slot | "an adult student with a weekly Tuesday slot" |
| naming two students who share an hour | "two students alternating in one hour" |
| quoting a parent's real email | "the parent's email matches the student's contact" |

Where a specific case genuinely must be identified for follow-up, use a **document id**
(`sched-w649…`, `stu-…`). It is precise, it is what you would need to act on it anyway,
and it means nothing to a reader without database access.

**Staff are different.** Katie and Nathan are the operators of this system and naming
them is how the work is described. Students, parents and leads are not.

## Fixtures and stories

Test data must be invented. There is a shared fixture set in
`@maple/react/storybook-fixtures` — use it. When a story needs a new person, invent one:

- names that are obviously not real ("Test Student", "Olive Thompson")
- emails on `@example.com` **only**
- phone numbers in the `555-01xx` range, which is reserved for fiction

Copying a real record out of production into a fixture is the commonest way this rule
gets broken, because the real record is right there and looks convenient.

## Reading production is fine; repeating it is not

Querying prod to understand a problem is normal and often necessary. What must not happen
is the answer being pasted into a PR, an issue, a commit message or a test.

Summarise instead: *"4 of 9 active students have no arrangement"* carries the finding.
The list of names does not add to it.

## Enforcement

The repo is public, so a leak is published the moment it is pushed or posted. Four layers
stand between a customer's details and GitHub:

| Layer | When | What it checks |
|---|---|---|
| `.githooks/pre-commit` + `commit-msg` | every commit | staged files and the message |
| `.githooks/pre-push` | every push | the whole tree, pushed commit messages, and a Claude read of the added lines (`tools/pii-claude-review.sh`) |
| `tools/claude-pii-guard.sh` (PreToolUse) | before an agent runs `git commit/push`, `gh pr/issue/release/api`, or a GitHub MCP write | the command text, `--body-file`s, staged files, MCP tool input |
| CI `customer-pii` job | every PR | the whole tree, with the roster from the `CUSTOMER_NAMES` secret |

The git hooks switch on with `pnpm install` (the `prepare` script sets `core.hooksPath`).
The agent hook is the one that matters most for PR and issue text: CI runs after a body is
posted, and notification emails have already gone out by then.

```bash
npx tsx tools/check-no-customer-pii.ts                      # whole repo
npx tsx tools/check-no-customer-pii.ts --files a.ts b.md    # specific files
echo "some text" | npx tsx tools/check-no-customer-pii.ts --stdin
```

Emails at consumer mail providers and phone numbers outside the 555 block are found by pattern.

### Names

No pattern can find a name, and no list of them can be committed — writing the customers'
names into a guard against writing the customers' names would defeat the point. So the
roster lives outside the repo:

```bash
npx tsx tools/generate-customer-roster.ts                 # prod → .customer-names.local (gitignored)
gh secret set CUSTOMER_NAMES < .customer-names.local       # same roster for CI
```

Rebuild it when the student list changes. It holds every customer's full name (also as a
camelCase identifier), their emails, and the single first/last names **the repo does not
already use** — a leak usually hides a first name inside an id (`cus_<name>`), but common
names already live in invented fixtures, and a guard that fires on every "Sarah" gets
switched off.

Matching is by **letter boundary**, not `\b`: the name must not have a letter before it,
and must be followed by a non-letter or a camelCase hump. So `cus_<name>` and
`<name><Surname>` match, while `Pip` does not match inside `Pipeline` and `Lea` does not
match inside `LEASE_TTL`. Matching ignores case. The checker **never prints the matched
name**, only `roster entry #N`, because its output goes to CI logs and agent transcripts.

A roster word that is genuinely not a customer here (a street, a common noun) gets the
usual `customer-pii-check-ignore: <why>` comment on the line above.

Fork PRs get no secrets, so CI checks patterns only there. Before opening a PR or filing
an issue, still reread it and ask whether any person named in it is a customer.
