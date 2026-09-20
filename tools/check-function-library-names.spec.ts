/**
 * The guard for the deploy-filter bijection: one library, one function, named
 * after it. Both directions of breaking it have shipped (legacy #835, legacy #872).
 */
import { describe, it, expect } from 'vitest';
import {
  camelize,
  kebab,
  parseEntryExports,
  findViolations,
} from './check-function-library-names';

describe('camelize matches the workflow’s awk', () => {
  it.each([
    ['get-artists', 'getArtists'],
    ['run-lesson-billing', 'runLessonBilling'],
    ['sync-class-to-webflow', 'syncClassToWebflow'],
    ['calendar-adhoc-proxy', 'calendarAdhocProxy'],
  ])('%s -> %s', (slug, camel) => {
    expect(camelize(slug)).toBe(camel);
  });
});

describe('kebab (for the suggested library path)', () => {
  it.each([
    ['chargeLessonsNow', 'charge-lessons-now'],
    ['healthCheck', 'health-check'],
    ['triggerLessonBilling', 'trigger-lesson-billing'],
  ])('%s -> %s', (camel, slug) => {
    expect(kebab(camel)).toBe(slug);
  });
});

describe('parseEntryExports', () => {
  it('tags a re-export with the library it came from', () => {
    const source = `export { getArtists } from '@maple/firebase/maple-functions/get-artists';`;
    expect(parseEntryExports(source)).toEqual([
      { name: 'getArtists', slug: 'get-artists' },
    ]);
  });

  it('reads every name in a multi-name re-export', () => {
    const source = `export {
      runLessonBilling,
      triggerLessonBilling,
    } from '@maple/firebase/maple-functions/run-lesson-billing';`;

    expect(parseEntryExports(source).map((e) => e.name)).toEqual([
      'runLessonBilling',
      'triggerLessonBilling',
    ]);
  });

  it('leaves an inline export with no library', () => {
    // healthCheck was declared like this — outside every possible filter.
    const source = `export const healthCheck = createPublicFunction(async () => ({}));`;
    expect(parseEntryExports(source)).toEqual([{ name: 'healthCheck' }]);
  });

  it('ignores type-only exports — there is nothing to deploy', () => {
    const source = `
      export type { Foo } from '@maple/firebase/maple-functions/foo';
      export { bar, type Baz } from '@maple/firebase/maple-functions/bar';
    `;
    expect(parseEntryExports(source).map((e) => e.name)).toEqual(['bar']);
  });

  it('ignores an import that merely mentions a function name', () => {
    const source = `
      import { runLessonBilling } from '@maple/firebase/maple-functions/run-lesson-billing';
      export { chargeDue } from '@maple/firebase/maple-functions/charge-due';
    `;
    expect(parseEntryExports(source).map((e) => e.name)).toEqual(['chargeDue']);
  });
});

describe('findViolations', () => {
  const exportsOf = (source: string) => parseEntryExports(source);

  it('passes a library exported under exactly its own name', () => {
    const entry = `export { getArtists } from '@maple/firebase/maple-functions/get-artists';`;
    expect(findViolations(['get-artists'], exportsOf(entry))).toEqual([]);
  });

  it('catches the legacy #835 case — the filter would name nothing', () => {
    // The library exported runLessonBillingScheduled, not runLessonBilling.
    // The filter asked for runLessonBilling, and all 26 maple-square functions
    // failed with it.
    const entry = `export { runLessonBillingScheduled } from '@maple/firebase/maple-functions/run-lesson-billing';`;

    expect(findViolations(['run-lesson-billing'], exportsOf(entry))).toEqual(
      expect.arrayContaining([
        { kind: 'missing', slug: 'run-lesson-billing', expected: 'runLessonBilling' },
      ])
    );
  });

  it('does not accept a longer name that merely starts with the expected one', () => {
    const entry = `export { runLessonBillingScheduled } from '@maple/firebase/maple-functions/run-lesson-billing';`;
    const violations = findViolations(['run-lesson-billing'], exportsOf(entry));
    expect(violations.some((v) => v.kind === 'missing')).toBe(true);
  });

  it('catches the legacy #872 case — a second export that never deploys', () => {
    // chargeLessonsNow shipped inside run-lesson-billing and was never created
    // in prod; the Pay-ahead button failed with functions/not-found.
    const entry = `export {
      runLessonBilling,
      chargeLessonsNow,
    } from '@maple/firebase/maple-functions/run-lesson-billing';`;

    expect(findViolations(['run-lesson-billing'], exportsOf(entry))).toEqual([
      {
        kind: 'extra',
        slug: 'run-lesson-billing',
        expected: 'runLessonBilling',
        name: 'chargeLessonsNow',
      },
    ]);
  });

  it('catches an admin trigger twin co-located with its schedule', () => {
    // The shape the old rule text explicitly blessed. Six of them were stranded.
    const entry = `export {
      sendClassReminders,
      triggerClassReminders,
    } from '@maple/firebase/maple-functions/send-class-reminders';`;

    expect(findViolations(['send-class-reminders'], exportsOf(entry))).toEqual([
      {
        kind: 'extra',
        slug: 'send-class-reminders',
        expected: 'sendClassReminders',
        name: 'triggerClassReminders',
      },
    ]);
  });

  it('catches an export declared inline in the entry point', () => {
    const entry = `export const healthCheck = createPublicFunction(async () => ({}));`;
    expect(findViolations([], exportsOf(entry))).toEqual([
      { kind: 'orphan', name: 'healthCheck' },
    ]);
  });

  it('reports a library nothing exports', () => {
    expect(findViolations(['get-artists'], [])).toEqual([
      { kind: 'missing', slug: 'get-artists', expected: 'getArtists' },
    ]);
  });

  it('reports a slug exported from an entry point with no library behind it', () => {
    // A typo'd or deleted directory: the filter is built from directories, so
    // this deploys nothing at all.
    const entry = `export { getArtist } from '@maple/firebase/maple-functions/get-artits';`;
    expect(findViolations([], exportsOf(entry))).toEqual(
      expect.arrayContaining([
        { kind: 'missing', slug: 'get-artits', expected: 'getArtits' },
      ])
    );
  });

  it('reports every offender, not just the first', () => {
    expect(findViolations(['a-thing', 'b-thing'], [])).toHaveLength(2);
  });

  it('accepts a twin that has been given its own library', () => {
    // The fix shape: two libraries, two filters, one function each.
    const entry = `
      export { sendClassReminders } from '@maple/firebase/maple-functions/send-class-reminders';
      export { triggerClassReminders } from '@maple/firebase/maple-functions/trigger-class-reminders';
    `;
    expect(
      findViolations(['send-class-reminders', 'trigger-class-reminders'], exportsOf(entry))
    ).toEqual([]);
  });
});
