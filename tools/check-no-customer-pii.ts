#!/usr/bin/env npx tsx
/**
 * Fail when a real-looking email address or phone number appears in anything
 * we write.
 *
 * WHY
 * ---
 * Families hand over a child's name, a parent's email and a card on file to
 * take music lessons. None of them agreed to appear in an engineering
 * artefact. Copying a real record out of production into a fixture is the
 * commonest way that happens, because the real record is right there and looks
 * convenient — it is exactly what happened across #798, #835 and #838.
 *
 * WHAT IT CAN AND CANNOT DO
 * -------------------------
 * Emails and phone numbers have a shape, so they can be checked. **Names do
 * not**, and no denylist can live here — writing the customers' names into a
 * guard against writing the customers' names would defeat the point.
 *
 * Emails are matched against consumer mailbox providers rather than "anything
 * that is not obviously fake". The first version of this flagged 246 things,
 * nearly all of them `a@b.com` placeholders and the studio's own addresses. A
 * guard that noisy gets switched off, which is worse than no guard at all.
 *
 * So this catches the mechanical half. The other half is on the author, and
 * `.claude/rules/customer-privacy.md` says so.
 *
 *   npx tsx tools/check-no-customer-pii.ts
 *   npx tsx tools/check-no-customer-pii.ts --report   # every match, allowed or not
 *
 * A genuinely necessary real address (a support inbox, a config default) is
 * declared on the line above:
 *
 *   // customer-pii-check-ignore: <why this is not a customer>
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..');

/** Where people write things. Excludes lockfiles and build output. */
const SCAN_DIRS = ['libs', 'apps', 'docs', 'tools', '.claude'];
const SCAN_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.md', '.json', '.html']);
const SKIP_DIRS = new Set([
  'node_modules', 'dist', '.next', 'coverage', 'storybook-static', '.nx',
]);

/**
 * Consumer mailbox providers. This is the signal that matters: a customer's
 * personal address is essentially always at one of these, and the studio's own
 * addresses never are.
 *
 * Written as an ALLOW-nothing list rather than a deny-everything one on
 * purpose. A guard that flagged every address would fire on `a@b.com`
 * placeholders and on `katie@mapleandsprucefolkarts.com`, and a guard that
 * cries wolf 246 times gets switched off — which is worse than no guard.
 */
const CONSUMER_MAIL_DOMAINS = [
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'hotmail.com',
  'outlook.com', 'live.com', 'msn.com', 'aol.com', 'icloud.com', 'me.com',
  'mac.com', 'proton.me', 'protonmail.com', 'pm.me', 'gmx.com', 'mail.com',
  'zoho.com', 'yandex.com', 'comcast.net', 'verizon.net', 'att.net',
  'sbcglobal.net', 'bellsouth.net', 'cox.net', 'charter.net', 'frontier.com',
];

/**
 * The studio's own published numbers. They appear in customer-facing email
 * templates because customers are meant to call them — they are on the website
 * and the shopfront. Business contact details are not customer data.
 */
const SHOP_PHONES = ['3043144506', '3046024030'];

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** North American numbers, loose enough to catch the formats people paste. */
const PHONE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g;

export interface PiiHit {
  file: string;
  line: number;
  kind: 'email' | 'phone' | 'name';
  value: string;
}

/**
 * Does this look like a real person's mailbox?
 *
 * True only for consumer mail providers. Business addresses on the studio's
 * own domain, and the `a@b.com` placeholders scattered through the specs, are
 * not customer data and must not be flagged.
 */
export function looksLikeCustomerEmail(email: string): boolean {
  const domain = email.toLowerCase().split('@')[1] ?? '';
  return CONSUMER_MAIL_DOMAINS.includes(domain);
}

/**
 * 555 is the block reserved for fiction. Accepted in EITHER position: the
 * convention is the 555 exchange (212-555-0100), but 555 is also widely used
 * as a stand-in area code, and this repo's fixtures already do both.
 */
export function isFictionalPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '').slice(-10);
  if (digits.length < 10) return true;
  if (/^(\d)\1{9}$/.test(digits)) return true;
  if (SHOP_PHONES.includes(digits)) return true;
  return digits.slice(0, 3) === '555' || digits.slice(3, 6) === '555';
}

/**
 * Optional local roster, one name per line, for a stricter local run.
 *
 * Names have no shape, so no pattern can find them and no list can be
 * committed — writing the customers' names into a guard against writing the
 * customers' names would defeat the point. This is the compromise: whoever
 * legitimately has the roster (the owner, or a session doing a deliberate
 * scrub) drops it in `.customer-names.local`, which is gitignored, and gets
 * name checking. CI never has the file and checks patterns only.
 *
 * Blank lines and `#` comments are ignored.
 */
function loadLocalNames(root: string): string[] {
  const file = path.join(root, '.customer-names.local');
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 1 && !l.startsWith('#'));
}

/** Whole-word matches only. A substring replace once turned
 *  `useSquareCardCandidates` into nonsense, because a first name was inside it. */
export function findNames(text: string, names: string[], file: string): PiiHit[] {
  const hits: PiiHit[] = [];
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (i > 0 && lines[i - 1].includes('customer-pii-check-ignore:')) return;
    for (const name of names) {
      const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (re.test(line)) {
        hits.push({ file, line: i + 1, kind: 'name', value: name });
      }
    }
  });
  return hits;
}

function* walk(dir: string): Generator<string> {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.claude') {
      if (!SCAN_DIRS.includes(entry.name)) continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(full);
    } else if (SCAN_EXT.has(path.extname(entry.name))) {
      yield full;
    }
  }
}

export function scanText(text: string, file: string): PiiHit[] {
  const hits: PiiHit[] = [];
  const lines = text.split('\n');

  lines.forEach((line, i) => {
    // An explicit, reasoned exemption on the line above.
    if (i > 0 && lines[i - 1].includes('customer-pii-check-ignore:')) return;

    for (const m of line.matchAll(EMAIL)) {
      if (looksLikeCustomerEmail(m[0])) {
        hits.push({ file, line: i + 1, kind: 'email', value: m[0] });
      }
    }
    for (const m of line.matchAll(PHONE)) {
      if (!isFictionalPhone(m[0])) {
        hits.push({ file, line: i + 1, kind: 'phone', value: m[0] });
      }
    }
  });

  return hits;
}

export function scanRepo(root: string = REPO_ROOT): PiiHit[] {
  const hits: PiiHit[] = [];
  const names = loadLocalNames(root);
  for (const dir of SCAN_DIRS) {
    for (const file of walk(path.join(root, dir))) {
      // The guard's own examples would otherwise flag it.
      if (file.endsWith('check-no-customer-pii.ts')) continue;
      if (file.endsWith('check-no-customer-pii.spec.ts')) continue;
      const text = fs.readFileSync(file, 'utf8');
      const rel = path.relative(root, file);
      hits.push(...scanText(text, rel));
      if (names.length > 0) hits.push(...findNames(text, names, rel));
    }
  }
  return hits;
}

function main(): void {
  const hits = scanRepo();

  const names = loadLocalNames(REPO_ROOT);
  const scope = names.length
    ? `emails, phone numbers and ${names.length} local name(s)`
    : 'emails and phone numbers (no .customer-names.local — names unchecked)';

  if (hits.length === 0) {
    console.log(`✓ Nothing found. Checked: ${scope}.`);
    return;
  }

  console.error(
    `✗ ${hits.length} personal contact detail(s) found in tracked source.\n`
  );
  console.error(
    'Customer names, emails and phone numbers must not appear in code, tests,\n' +
      'fixtures, stories, docs, commit messages, PRs or issues — see\n' +
      '.claude/rules/customer-privacy.md. Use @example.com and 555-01xx.\n'
  );
  for (const hit of hits) {
    console.error(`  ${hit.file}:${hit.line}  ${hit.kind}  ${hit.value}`);
  }
  console.error(
    '\nIf one is genuinely not a customer, say so on the line above:\n' +
      '  // customer-pii-check-ignore: <why>\n'
  );
  process.exit(1);
}

if (require.main === module) main();
