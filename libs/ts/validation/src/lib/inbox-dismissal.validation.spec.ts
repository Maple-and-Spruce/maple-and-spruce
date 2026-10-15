import { describe, it, expect } from 'vitest';
import { inboxDismissalValidation } from './inbox-dismissal.validation';

describe('inboxDismissalValidation', () => {
  it('accepts a key the inbox builds', () => {
    expect(
      inboxDismissalValidation({ key: 'charge-failed:chg-1:1760000000000' }).hasErrors()
    ).toBe(false);
  });

  it('requires a key', () => {
    expect(inboxDismissalValidation({}).getErrors().key).toEqual([
      'Item key is required',
    ]);
    expect(inboxDismissalValidation({ key: '' }).hasErrors('key')).toBe(true);
    expect(inboxDismissalValidation({ key: 7 }).hasErrors('key')).toBe(true);
  });

  it.each([
    'mystery-kind:1',
    'lesson-inquiry:a/b',
    'lesson-inquiry:a b',
    'no-colon',
    `lesson-inquiry:${'x'.repeat(500)}`,
  ])('rejects %s', (key) => {
    expect(inboxDismissalValidation({ key }).getErrors().key).toEqual([
      'Item key is not one the inbox builds',
    ]);
  });
});
