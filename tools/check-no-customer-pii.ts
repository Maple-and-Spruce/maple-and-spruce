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
 * Names are checked against a roster that never lives in the repo: the
 * gitignored `.customer-names.local` (built by `generate-customer-roster.ts`)
 * and, in CI, the `CUSTOMER_NAMES` secret.
 *
 *   npx tsx tools/check-no-customer-pii.ts                  # the whole repo
 *   npx tsx tools/check-no-customer-pii.ts --files a.ts b.md # just these (git hooks)
 *   gh pr view 1 --json body -q .body | npx tsx tools/check-no-customer-pii.ts --stdin
 *
 * A matched name is never printed — only the file, line and which roster
 * entry. The output of this script lands in CI logs and agent transcripts.
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
 * The roster, one name (or email) per line.
 *
 * Names have no shape, so no pattern can find them and no list can be
 * committed — writing the customers' names into a guard against writing the
 * customers' names would defeat the point. So the roster comes from outside
 * the repo: `.customer-names.local` (gitignored, built from prod by
 * `tools/generate-customer-roster.ts`) and the `CUSTOMER_NAMES` env var, which
 * CI fills from a repository secret. Fork PRs get neither and check patterns
 * only.
 *
 * Blank lines and `#` comments are ignored.
 */
export function loadNames(root: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const file = path.join(root, '.customer-names.local');
  const fromFile = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const all = `${fromFile}\n${env['CUSTOMER_NAMES'] ?? ''}`
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 1 && !l.startsWith('#'));
  return [...new Set(all)];
}

/**
 * A name matches only as its own word — a substring replace once turned
 * `useSquareCardCandidates` into nonsense, because a first name was inside it.
 *
 * But "its own word" has to mean what it means in code, not what `\b` means.
 * The leak this guard exists for lived in `cus_<firstname>` and
 * `<firstname><Surname>`, and `\b` sees neither: `_` is a word character, and a
 * camelCase join has no boundary at all. So the edges are letters: nothing
 * alphabetic before, and no lowercase letter after (an uppercase one starts
 * the next camelCase word — but only a real hump, uppercase then lowercase,
 * or `LEASE_TTL` would contain a three-letter name). Case-insensitivity is
 * spelled out per letter, because the `i` flag would break those lookaheads.
 */
export function namePattern(name: string): RegExp {
  const body = [...name]
    .map((ch) => {
      const lo = ch.toLowerCase();
      const up = ch.toUpperCase();
      if (lo !== up) return `[${lo}${up}]`;
      return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return new RegExp(`(?<![A-Za-z])${body}(?:(?![A-Za-z])|(?=[A-Z][a-z]))`);
}

export function findNames(text: string, names: string[], file: string): PiiHit[] {
  const hits: PiiHit[] = [];
  const patterns = names.map(namePattern);
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (i > 0 && lines[i - 1].includes('customer-pii-check-ignore:')) return;
    patterns.forEach((re, n) => {
      if (re.test(line)) {
        // Never echo the name itself: this output reaches CI logs and transcripts.
        hits.push({ file, line: i + 1, kind: 'name', value: `roster entry #${n + 1}` });
      }
    });
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
  const files: string[] = [];
  for (const dir of SCAN_DIRS) files.push(...walk(path.join(root, dir)));
  return scanFiles(files, root);
}

/** Lockfiles are full of hashes that look like phone numbers, and nobody writes them by hand. */
const SKIP_FILES = /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|function-count-baseline\.json)$/;

/** The guard's own examples would otherwise flag it. */
const isGuardFile = (file: string): boolean =>
  /check-no-customer-pii(\.spec)?\.ts$/.test(file);

/**
 * Scan an explicit list of files — what the git hooks hand over. Any text file
 * counts here, not just SCAN_DIRS/SCAN_EXT: a staged `.csv` or `.yml` is
 * exactly where a pasted export would turn up.
 */
export function scanFiles(files: string[], root: string = REPO_ROOT): PiiHit[] {
  const hits: PiiHit[] = [];
  const names = loadNames(root);
  for (const file of files) {
    const full = path.resolve(root, file);
    const rel = path.relative(root, full);
    if (isGuardFile(rel) || SKIP_FILES.test(rel)) continue;
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) continue;
    const buf = fs.readFileSync(full);
    if (buf.includes(0)) continue; // binary
    const text = buf.toString('utf8');
    hits.push(...scanText(text, rel));
    if (names.length > 0) hits.push(...findNames(text, names, rel));
  }
  return hits;
}

/** Commit messages, PR bodies, issue comments — text that never becomes a file. */
export function scanStdinText(text: string, root: string = REPO_ROOT): PiiHit[] {
  const names = loadNames(root);
  return [
    ...scanText(text, '<stdin>'),
    ...(names.length > 0 ? findNames(text, names, '<stdin>') : []),
  ];
}

/** `someone@gmail.com` → `s***@gmail.com`; a phone keeps its last two digits. */
export function redact(hit: PiiHit): string {
  if (hit.kind === 'email') return hit.value.replace(/^(.)[^@]*/, '$1***');
  if (hit.kind === 'phone') return `***-***-**${hit.value.replace(/\D/g, '').slice(-2)}`;
  return hit.value;
}

function main(): void {
  const args = process.argv.slice(2);
  const hits = args.includes('--stdin')
    ? scanStdinText(fs.readFileSync(0, 'utf8'))
    : args.includes('--files')
      ? scanFiles(args.filter((a) => !a.startsWith('--')))
      : scanRepo();

  const names = loadNames(REPO_ROOT);
  const scope = names.length
    ? `emails, phone numbers and ${names.length} roster name(s)`
    : 'emails and phone numbers (no roster — names unchecked; run tools/generate-customer-roster.ts)';

  if (hits.length === 0) {
    if (!args.includes('--quiet')) console.log(`✓ Nothing found. Checked: ${scope}.`);
    return;
  }

  console.error(`✗ ${hits.length} personal detail(s) found.\n`);
  console.error(
    'Customer names, emails and phone numbers must not appear in code, tests,\n' +
      'fixtures, stories, docs, commit messages, PRs or issues — see\n' +
      '.claude/rules/customer-privacy.md. Use @example.com and 555-01xx.\n'
  );
  for (const hit of hits) {
    console.error(`  ${hit.file}:${hit.line}  ${hit.kind}  ${redact(hit)}`);
  }
  console.error(
    '\nIf one is genuinely not a customer, say so on the line above:\n' +
      '  // customer-pii-check-ignore: <why>\n'
  );
  process.exit(1);
}

if (require.main === module) main();
