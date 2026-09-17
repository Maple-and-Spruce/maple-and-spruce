#!/usr/bin/env npx tsx
/**
 * Build `.customer-names.local` — the roster `check-no-customer-pii.ts` checks
 * names against — from production.
 *
 * WHY
 * ---
 * Names have no shape, so the guard can only find the ones it is told about,
 * and the list can never be committed. This builds it from the people who
 * actually hand the studio their details: students, their contacts, leads,
 * registrants, Music Together families, Craft Club members and signers.
 *
 * WHAT GOES IN
 * ------------
 * - every full name, as written and as one camelCase identifier (`firstLast`)
 * - every customer email address that is not the studio's own
 * - single first names and surnames, but ONLY those that appear nowhere in the
 *   repo today. The leak this exists for was a first name inside an id
 *   (`cus_<firstname>`), which a full-name check cannot see; but common names
 *   are already all over the fixtures, and a guard that fires on every "Sarah"
 *   gets switched off. A name nobody has used yet is one worth hearing about.
 *
 * Staff are left out: naming Katie and Nathan is how the work is described.
 *
 * Nothing is printed except counts. Needs Application Default Credentials with
 * read access to the prod project (`gcloud auth application-default login`).
 *
 *   npx tsx tools/generate-customer-roster.ts
 *   gh secret set CUSTOMER_NAMES < .customer-names.local   # give CI the same roster
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const REPO_ROOT = path.resolve(__dirname, '..');
const OUT = path.join(REPO_ROOT, '.customer-names.local');

/** Collections that hold people who are customers, not staff or artists. */
const COLLECTIONS = [
  'agreementRequests',
  'craftClubAccessTokens',
  'craftClubMembers',
  'lessonInquiries',
  'mail',
  'musicTogetherInterest',
  'musicTogetherRegistrations',
  'registrations',
  'signedAgreements',
  'students',
];

/** Field names (last path segment) that hold a person's name. */
const NAME_FIELD =
  /^(name|signerName|printedName|contactName|customerName|registrantName|caregiverName|childNames|primaryContactName|parentNames|adultFirstName|adultLastName)$/;

/** A `name` under these paths is a class, section or template — not a person. */
const NOT_A_PERSON = /className|instructorName|sectionName|^template\.name$|formName/;

const STAFF = new Set(['katie', 'nathan', 'stephanie', 'zucker', 'david', 'mccoy', 'maple', 'spruce']);

/** Placeholder words people type into a name field. They are not anyone. */
const NOT_A_NAME = new Set([
  'test', 'student', 'parent', 'child', 'kid', 'guest', 'unknown', 'customer',
  'adult', 'family', 'mom', 'dad', 'mr', 'mrs', 'ms', 'dr', 'and', 'the',
]);

const STUDIO_EMAIL = /@(example\.com|mapleandspruce[a-z]*\.com|musictogether[a-z.]*)$/i;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export interface Roster {
  fullNames: Set<string>;
  tokens: Set<string>;
  emails: Set<string>;
}

/** Split "A & B", "A and B", "A, B" into separate people. */
export function splitPeople(value: string): string[] {
  return value
    .split(/\s*(?:,|&|\band\b)\s*/)
    .map((n) => n.trim().replace(/\s+/g, ' '))
    .filter((n) => /[A-Za-z]{2,}/.test(n));
}

export function collectFromDoc(doc: unknown, roster: Roster): void {
  const addName = (name: string): void => {
    const words = name
      .split(' ')
      .filter((w) => /^[A-Za-z][A-Za-z'-]*[A-Za-z]$/.test(w))
      .filter((w) => !NOT_A_NAME.has(w.toLowerCase()));
    if (words.length === 0 || words.every((w) => STAFF.has(w.toLowerCase()))) return;
    if (words.length > 1) roster.fullNames.add(words.join(' '));
    words.forEach((w) => roster.tokens.add(w));
  };

  const walk = (value: unknown, p: string): void => {
    if (value == null) return;
    if (typeof value === 'string') {
      for (const m of value.match(EMAIL) ?? []) {
        if (!STUDIO_EMAIL.test(m)) roster.emails.add(m.toLowerCase());
      }
      const field = p.replace(/\[\]/g, '').split('.').pop() ?? '';
      if (NAME_FIELD.test(field) && !NOT_A_PERSON.test(p)) splitPeople(value).forEach(addName);
      return;
    }
    if (typeof value !== 'object' || 'toDate' in (value as object)) return;
    if (Array.isArray(value)) {
      value.forEach((v) => walk(v, `${p}[]`));
      return;
    }
    const o = value as Record<string, unknown>;
    if (typeof o['adultFirstName'] === 'string' && typeof o['adultLastName'] === 'string') {
      addName(`${o['adultFirstName']} ${o['adultLastName']}`);
    }
    for (const [k, v] of Object.entries(o)) walk(v, p ? `${p}.${k}` : k);
  };

  walk(doc, '');
}

/** `june ward` → `juneWard`: how a full name turns up as a variable. */
export function camelJoin(fullName: string): string {
  const [first, ...rest] = fullName.toLowerCase().split(' ');
  return first + rest.map((w) => w[0].toUpperCase() + w.slice(1)).join('');
}

/**
 * Every word already present in tracked files, split the way the guard sees
 * words: at camelCase humps, underscores, hyphens and apostrophes as well as
 * spaces. A token only counts as "unused" if the guard would not already fire
 * on it today.
 */
export function wordsIn(text: string): Set<string> {
  const words = new Set<string>();
  for (const run of text.match(/[A-Za-z']+/g) ?? []) {
    words.add(run.toLowerCase());
    for (const part of run.split(/'|(?<=[a-z])(?=[A-Z])/)) words.add(part.toLowerCase());
  }
  return words;
}

function wordsInRepo(): Set<string> {
  const out = execFileSync('git', ['grep', '-hoIE', "[A-Za-z']{3,}", '--', '.', ':!pnpm-lock.yaml'], {
    cwd: REPO_ROOT,
    maxBuffer: 512 * 1024 * 1024,
  }).toString();
  return wordsIn(out);
}

export function renderRoster(roster: Roster, repoWords: Set<string>): string {
  const lines = new Set<string>();
  for (const n of roster.fullNames) {
    lines.add(n);
    lines.add(camelJoin(n));
  }
  for (const t of roster.tokens) {
    const lower = t.toLowerCase();
    if (lower.length >= 3 && !STAFF.has(lower) && !repoWords.has(lower)) lines.add(t);
  }
  for (const e of roster.emails) lines.add(e);
  return [
    '# Generated by tools/generate-customer-roster.ts from production. NEVER commit.',
    `# ${new Date().toISOString()}`,
    ...[...lines].sort(),
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  const db = getFirestore(initializeApp({ projectId: 'maple-and-spruce' }));
  const roster: Roster = { fullNames: new Set(), tokens: new Set(), emails: new Set() };
  for (const name of COLLECTIONS) {
    const snap = await db.collection(name).get();
    snap.docs.forEach((d) => collectFromDoc(d.data(), roster));
  }
  const text = renderRoster(roster, wordsInRepo());
  fs.writeFileSync(OUT, text, { mode: 0o600 });
  const entries = text.split('\n').filter((l) => l && !l.startsWith('#')).length;
  console.log(
    `✓ Wrote ${entries} roster entries to .customer-names.local ` +
      `(${roster.fullNames.size} full names, ${roster.emails.size} emails). ` +
      'Refresh CI with: gh secret set CUSTOMER_NAMES < .customer-names.local'
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
