/**
 * Static analyzer: every deployed callable declares a role, or is explicitly
 * allowlisted as public / auth-only.
 *
 * Why this exists: the scoped-roles enforcement (epic #617) gates each Cloud
 * Function with `requiringRole(...)`. The failure mode it introduces is a NEW
 * callable that ships with no role check — silently reachable by anyone signed
 * in, or anyone at all. That's exactly how ~18 reads were left auth-only before
 * #633 (getStudents, etc. — children's PII). A green test suite doesn't catch
 * it; review discipline is unreliable. This turns "did we protect the new
 * endpoint" into a failing check.
 *
 * Rule: for every function EXPORTED from a codebase entry point
 * (the four apps/functions... src/index.ts files), its definition must be one of:
 *   - role-gated: `requiringRole(...)`, `createAdminFunction`, `createRoleFunction`
 *       -> always allowed, no allowlist entry needed.
 *   - trigger: `onDocumentWritten` / `onSchedule` / ... (not client-callable)
 *       -> exempt (nothing to gate).
 *   - auth-only: `requiringAuth()` / `createAuthenticatedFunction`
 *       -> MUST be listed in ALLOWLIST.authOnly.
 *   - public: `createPublicFunction`, a raw `onRequest` (webhooks/feeds), or an
 *     ungated `Functions.endpoint...handle()`
 *       -> MUST be listed in ALLOWLIST.public.
 *
 * Adding a public/auth-only endpoint is then a deliberate, reviewable diff to
 * the allowlist below — not an invisible gap.
 *
 * Usage:
 *   npx tsx tools/check-callable-roles.ts            # exits 1 on any violation
 *   npx tsx tools/check-callable-roles.ts --report   # prints every function + classification
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

const ROOT = path.resolve(__dirname, '..');
const REPORT = process.argv.includes('--report');

const ENTRY_POINTS = [
  'apps/functions/src/index.ts',
  'apps/functions-calendar/src/index.ts',
  'apps/functions-square/src/index.ts',
  'apps/functions-sync/src/index.ts',
  'apps/functions-webhooks/src/index.ts',
];

const MAPLE_FUNCTIONS_PREFIX = '@maple/firebase/maple-functions/';

// ---------------------------------------------------------------------------
// Allowlists — the ONLY functions permitted to be reachable without a role.
// Adding an entry here is a deliberate, reviewable decision.
// ---------------------------------------------------------------------------

/**
 * Public endpoints: no auth at all. Customer-facing checkout/lookup, token-based
 * flows, webhooks (signature-verified), calendar ICS feeds, and health.
 */
const PUBLIC_ALLOWLIST = new Set<string>([
  // Health / infra
  'healthCheck',
  // Public customer-facing reads (Webflow widgets)
  'getPublicClass',
  'getPublicMusicTogetherSection',
  'getPublicMusicTogetherSections',
  'getPublicMusicTogetherDemos',
  'getRelatedPublicClasses',
  'getRegistrationStatus',
  'getRequiredAgreementsForClass',
  'calculateRegistrationCost',
  'lookupDiscount',
  // Public customer-facing writes (checkout / interest / waitlist).
  // NOTE: cancelRegistration / cancelMusicTogetherRegistration are role-gated
  // (admin/clerk), NOT public — so they are intentionally absent here.
  'createRegistration',
  // Safari/ITP hosted-checkout fallback — same public self-service surface as
  // createRegistration (reserves a spot + returns a Square-hosted checkout URL).
  'createRegistrationCheckoutLink',
  'createMusicTogetherRegistration',
  'addMusicTogetherInterest',
  'addMusicTogetherDemoRsvp',
  'addToClassWaitlist',
  'addToMusicTogetherWaitlist',
  'createCraftClubSubscription',
  'cancelCraftClubSubscription',
  'requestCraftClubAccess',
  'checkCraftClubEligibility',
  // Token-based (magic-link / session-token) flows — auth is the signed
  // token, not a Firebase session.
  'getAgreementForSigning',
  'submitSignedAgreement',
  'requestMusicTogetherManageLink',
  'startMusicTogetherManageSession',
  'updateMusicTogetherPaymentMethod',
  'requestCraftClubManageLink',
  'startCraftClubSession',
  'updateCraftClubPaymentMethod',
  'getCraftClubSubscription',
  // Webhooks (signature-verified inside the handler)
  'squareWebhook',
  'tallyLeadWebhook',
  // (Etsy OAuth callbacks etsyAuthUrl/etsyAuthCallback are admin-gated, not
  // public — they configure the shop's connection.)
  // Calendar ICS feeds (token- or public-by-design)
  'calendarEmbed',
  'calendarAdhocProxy',
  'calendarAllFeed',
  'calendarClassesFeed',
  'calendarEventsFeed',
  'calendarMusicFeed',
  'calendarMusicTogetherFeed',
  'calendarFamilyMusicTogetherFeed',
  'calendarHoursFeed',
  'calendarPrivateFeed',
  'classCatalogFeed',
]);

/**
 * Auth-only endpoints: require a signed-in user but intentionally NO role
 * (any authenticated user may call). Keep this list tiny.
 */
const AUTH_ONLY_ALLOWLIST = new Set<string>([
  // The client uses these to discover its own access before any role exists.
  'checkAdminStatus',
  'getMyRoles',
]);

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

type Gate =
  | 'role'
  | 'auth'
  | 'public'
  | 'trigger'
  | 'raw-http'
  | 'unknown';

const ROLE_FACTORIES = new Set(['createAdminFunction', 'createRoleFunction']);
const AUTH_FACTORIES = new Set(['createAuthenticatedFunction']);
const PUBLIC_FACTORIES = new Set(['createPublicFunction']);
const TRIGGER_FACTORIES = new Set([
  'onDocumentWritten',
  'onDocumentCreated',
  'onDocumentUpdated',
  'onDocumentDeleted',
  'onSchedule',
  'onValueWritten',
]);

/**
 * Classify a function definition by walking its builder call-chain, ignoring
 * the handler-body argument (so a handler that merely mentions a token can't
 * skew the result).
 */
function classifyInitializer(expr: ts.Expression): Gate {
  const methods = new Set<string>();
  let base: string | undefined;

  let node: ts.Node = expr;
  // Unwrap parentheses / as-casts
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node)
  ) {
    node = node.expression;
  }

  // Walk down the callee chain collecting method names; stop at the base.
  for (;;) {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee)) {
        base = callee.text;
        break;
      }
      if (ts.isPropertyAccessExpression(callee)) {
        methods.add(callee.name.text);
        node = callee.expression;
        continue;
      }
      break;
    }
    if (ts.isPropertyAccessExpression(node)) {
      // e.g. `Functions.endpoint` with no trailing call
      if (ts.isIdentifier(node.expression)) {
        base = node.expression.text;
        break;
      }
      node = node.expression;
      continue;
    }
    if (ts.isIdentifier(node)) {
      base = node.text;
      break;
    }
    break;
  }

  if (base && ROLE_FACTORIES.has(base)) return 'role';
  if (base && AUTH_FACTORIES.has(base)) return 'auth';
  if (base && PUBLIC_FACTORIES.has(base)) return 'public';
  if (base && TRIGGER_FACTORIES.has(base)) return 'trigger';
  if (base === 'onRequest') return 'raw-http';

  // Functions.endpoint fluent chain
  if (methods.has('requiringRole')) return 'role';
  if (methods.has('requiringAuth')) return 'auth';
  if (base === 'Functions' || methods.has('handle')) return 'public';

  return 'unknown';
}

// ---------------------------------------------------------------------------
// Source scanning
// ---------------------------------------------------------------------------

function parse(file: string): ts.SourceFile {
  const text = fs.readFileSync(file, 'utf8');
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
}

/** Find `export const <name> = <init>` in a source file, return the initializer. */
function findExportedConstInitializer(
  sf: ts.SourceFile,
  name: string
): ts.Expression | undefined {
  let found: ts.Expression | undefined;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (
      ts.isVariableStatement(node) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      for (const decl of node.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          decl.name.text === name &&
          decl.initializer
        ) {
          found = decl.initializer;
          return;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/** Resolve a maple-functions slug to the gate of its exported `name`. */
function classifyReexport(slug: string, name: string): Gate {
  const libDir = path.join(ROOT, 'libs/firebase/maple-functions', slug, 'src');
  if (!fs.existsSync(libDir)) return 'unknown';
  const files = walkTs(libDir).filter((f) => !/\.spec\.ts$/.test(f));
  for (const file of files) {
    const init = findExportedConstInitializer(parse(file), name);
    if (init) return classifyInitializer(init);
  }
  return 'unknown';
}

function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkTs(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

interface FunctionInfo {
  name: string;
  gate: Gate;
  entry: string;
}

/** Collect every function exported from an entry point, with its gate. */
function collectFromEntry(entryRel: string): FunctionInfo[] {
  const entryFile = path.join(ROOT, entryRel);
  const sf = parse(entryFile);
  const out: FunctionInfo[] = [];

  const visit = (node: ts.Node): void => {
    // Re-export: `export { a, b } from '@maple/firebase/maple-functions/slug'`
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text.startsWith(MAPLE_FUNCTIONS_PREFIX) &&
      node.exportClause &&
      ts.isNamedExports(node.exportClause)
    ) {
      const slug = node.moduleSpecifier.text.slice(
        MAPLE_FUNCTIONS_PREFIX.length
      );
      for (const el of node.exportClause.elements) {
        const name = el.name.text;
        out.push({ name, gate: classifyReexport(slug, name), entry: entryRel });
      }
    }
    // Inline: `export const name = <builder>(...)`
    if (
      ts.isVariableStatement(node) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.initializer) {
          out.push({
            name: decl.name.text,
            gate: classifyInitializer(decl.initializer),
            entry: entryRel,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const all: FunctionInfo[] = [];
  for (const entry of ENTRY_POINTS) {
    all.push(...collectFromEntry(entry));
  }
  // Dedup by name (a function is exported once).
  const byName = new Map<string, FunctionInfo>();
  for (const fn of all) if (!byName.has(fn.name)) byName.set(fn.name, fn);
  const functions = [...byName.values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  if (REPORT) {
    for (const fn of functions) {
      console.log(`${fn.gate.padEnd(9)} ${fn.name}`);
    }
    console.log(`\n${functions.length} functions across ${ENTRY_POINTS.length} codebases`);
  }

  const violations: string[] = [];
  const staleAllowlist: string[] = [];

  const seenPublic = new Set<string>();
  const seenAuth = new Set<string>();

  for (const fn of functions) {
    switch (fn.gate) {
      case 'role':
      case 'trigger':
        break; // always fine
      case 'auth':
        if (!AUTH_ONLY_ALLOWLIST.has(fn.name)) {
          violations.push(
            `  ${fn.name} — auth-only (requiringAuth / createAuthenticatedFunction) but not in AUTH_ONLY_ALLOWLIST`
          );
        } else seenAuth.add(fn.name);
        break;
      case 'public':
      case 'raw-http':
        if (!PUBLIC_ALLOWLIST.has(fn.name)) {
          violations.push(
            `  ${fn.name} — ${fn.gate} (no role check) but not in PUBLIC_ALLOWLIST`
          );
        } else seenPublic.add(fn.name);
        break;
      case 'unknown':
        violations.push(
          `  ${fn.name} — could not classify its gate; declare a role or add to an allowlist`
        );
        break;
    }
  }

  // Flag allowlist entries that no longer correspond to a public/auth function
  // (renamed/removed) so the lists don't rot.
  for (const name of PUBLIC_ALLOWLIST) {
    if (!seenPublic.has(name)) staleAllowlist.push(`  PUBLIC_ALLOWLIST: ${name}`);
  }
  for (const name of AUTH_ONLY_ALLOWLIST) {
    if (!seenAuth.has(name)) staleAllowlist.push(`  AUTH_ONLY_ALLOWLIST: ${name}`);
  }

  if (violations.length > 0) {
    console.error(
      `\n✖ ${violations.length} callable(s) reachable without a declared role and not allowlisted:\n`
    );
    console.error(violations.join('\n'));
    console.error(
      `\nFix: gate the function with .requiringRole([...]) (or createAdminFunction/createRoleFunction),\n` +
        `or — if it is intentionally public / auth-only — add it to the matching allowlist in\n` +
        `tools/check-callable-roles.ts with a comment saying why.`
    );
    if (staleAllowlist.length > 0) {
      console.error(`\nAlso, stale allowlist entries (no matching function):`);
      console.error(staleAllowlist.join('\n'));
    }
    process.exit(1);
  }

  if (staleAllowlist.length > 0) {
    // Stale entries are a warning, not a hard fail — a removed function
    // shouldn't block an unrelated PR, but surface it so the list stays clean.
    console.warn(
      `⚠ ${staleAllowlist.length} allowlist entr(y/ies) no longer match a function (rename/remove?):`
    );
    console.warn(staleAllowlist.join('\n'));
  }

  console.log(
    `✓ All ${functions.length} exported functions are role-gated, triggers, or explicitly allowlisted.`
  );
}

main();
