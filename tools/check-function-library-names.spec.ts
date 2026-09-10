/**
 * The guard for the failure that took down a whole deploy batch after merge.
 */
import { describe, it, expect } from 'vitest';
import { camelize, findUnexported } from './check-function-library-names';

describe('camelize matches the workflow’s awk', () => {
  it.each([
    ['get-artists', 'getArtists'],
    ['run-lesson-billing', 'runLessonBilling'],
    ['sync-class-to-webflow', 'syncClassToWebflow'],
    ['calendar-adhoc-proxy', 'calendarAdhocProxy'],
  ])('%s -> %s', (kebab, camel) => {
    expect(camelize(kebab)).toBe(camel);
  });
});

describe('findUnexported', () => {
  it('passes a library whose name is exported', () => {
    expect(
      findUnexported(['get-artists'], `export { getArtists } from '...';`)
    ).toEqual([]);
  });

  it('catches the real #835 case', () => {
    // The library exported runLessonBillingScheduled and triggerLessonBilling.
    // The deploy filter asked for runLessonBilling, which did not exist, and
    // all 26 maple-square functions failed with it.
    const entry = `export { runLessonBillingScheduled, triggerLessonBilling } from '...';`;

    expect(findUnexported(['run-lesson-billing'], entry)).toEqual([
      { lib: 'run-lesson-billing', expected: 'runLessonBilling' },
    ]);
  });

  it('does not accept a longer name that merely starts with it', () => {
    // The whole bug: runLessonBillingScheduled looks like a match to a naive
    // substring check, and the deploy filter still fails.
    expect(
      findUnexported(['run-lesson-billing'], `export { runLessonBillingScheduled };`)
    ).toHaveLength(1);
  });

  it('allows a library to export more than its own name', () => {
    // A scheduled job plus its admin trigger twin is the common shape.
    const entry = `export { runLessonBilling, triggerLessonBilling } from '...';`;
    expect(findUnexported(['run-lesson-billing'], entry)).toEqual([]);
  });

  it('reports every offender, not just the first', () => {
    expect(findUnexported(['a-thing', 'b-thing'], '')).toHaveLength(2);
  });
});
