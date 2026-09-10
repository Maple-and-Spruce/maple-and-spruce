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

```bash
npx tsx tools/check-no-customer-pii.ts
```

Fails on an email address or phone number in source, tests, stories or docs that is not
obviously fictional. **CI runs it on every PR** (`build-check.yml` → `customer-pii` job), so a
real address or number cannot reach main again through code.

### Names

No pattern can find a name, and no list of them can be committed — writing the customers'
names into a guard against writing the customers' names would defeat the point.

So the guard checks names only when you give it a roster it can use locally:

```bash
# gitignored; never commit it
printf 'Firstname Lastname\nFirstname\n' >> .customer-names.local
npx tsx tools/check-no-customer-pii.ts
```

Whoever legitimately holds the roster — the owner, or a session doing a deliberate
scrub — gets name checking. CI never has the file, so it checks patterns only.

Matching is **whole-word and case-insensitive**. That matters: a substring replace once
turned `useSquareCardCandidates` into nonsense, because a first name sits inside
"Candidates".

Without that file, **names are on you**. Before opening a PR or filing an issue, reread it
and ask whether any person named in it is a customer.
