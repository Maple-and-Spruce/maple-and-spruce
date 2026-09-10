/**
 * The guard against pasting a customer's contact details into the repo.
 *
 * The bar it has to clear is not "does it find emails" — it is that it finds
 * the ones that matter and stays quiet about the ones that do not. An earlier
 * version flagged 246 things, nearly all `a@b.com` placeholders and the
 * studio's own addresses, and a guard that noisy gets switched off.
 */
import { describe, it, expect } from 'vitest';
import {
  findNames,
  isFictionalPhone,
  looksLikeCustomerEmail,
  scanText,
} from './check-no-customer-pii';

describe('what counts as a customer email', () => {
  it.each([
    'someone@gmail.com',
    'Someone@Yahoo.com',
    'a.person@icloud.com',
    'name@protonmail.com',
    'user@comcast.net',
  ])('flags %s — a personal mailbox', (email) => {
    expect(looksLikeCustomerEmail(email)).toBe(true);
  });

  it.each([
    'katie@mapleandsprucefolkarts.com', // the studio's own
    'a@b.com', // a placeholder in a spec
    'test@example.com',
    'e2e+run1@maplespruce.test',
    'noreply@anthropic.com',
  ])('stays quiet about %s', (email) => {
    expect(looksLikeCustomerEmail(email)).toBe(false);
  });
});

describe('what counts as a fictional phone', () => {
  it.each(['555-123-4567', '(555) 013-3530', '212-555-0100', '+1 555 010 0001'])(
    'accepts %s — 555 is reserved for fiction',
    (phone) => {
      expect(isFictionalPhone(phone)).toBe(true);
    }
  );

  it('accepts the studio’s own published numbers', () => {
    // They are on the website and the shopfront; customers are meant to call
    // them. Business contact details are not customer data.
    expect(isFictionalPhone('304-314-4506')).toBe(true);
    expect(isFictionalPhone('(304) 602-4030')).toBe(true);
  });

  it('flags anything else that looks like a real number', () => {
    expect(isFictionalPhone('412-867-5309')).toBe(false);
  });
});

describe('scanning', () => {
  it('reports the line a personal address is on', () => {
    const hits = scanText('const a = 1;\nconst e = "who@gmail.com";\n', 'f.ts');

    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ line: 2, kind: 'email' });
  });

  it('honours an explicit exemption on the line above', () => {
    const text = [
      '// customer-pii-check-ignore: the shop owner, not a customer',
      'const e = "someone@gmail.com";',
    ].join('\n');

    expect(scanText(text, 'f.ts')).toEqual([]);
  });

  it('exempts only the next line, not the rest of the file', () => {
    const text = [
      '// customer-pii-check-ignore: one address',
      'const a = "one@gmail.com";',
      'const b = "two@gmail.com";',
    ].join('\n');

    const hits = scanText(text, 'f.ts');
    expect(hits).toHaveLength(1);
    expect(hits[0].line).toBe(3);
  });

  it('says nothing about a file with no contact details', () => {
    expect(scanText('export const x = 1;\n', 'f.ts')).toEqual([]);
  });
});

describe('name matching, when a local roster is supplied', () => {
  it('finds a name as a whole word', () => {
    const hits = findNames('const who = "June Ward";', ['June'], 'f.ts');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ kind: 'name', value: 'June' });
  });

  it('does NOT match a name inside a longer word', () => {
    // This is the bug that made a first pass at scrubbing worse: a substring
    // replace turned an identifier into nonsense, because a student's first
    // name sat inside a longer word in it. `Pip` inside `Pipeline` is the same
    // shape — a real roster name that is a prefix of an ordinary code word.
    expect(
      findNames('export { buildPipeline };', ['Pip'], 'f.ts')
    ).toEqual([]);
  });

  it('is case-insensitive, since fixtures lowercase names into ids', () => {
    expect(findNames('const id = "june-ward";', ['June'], 'f.ts')).toHaveLength(1);
  });

  it('honours the same exemption comment as the pattern checks', () => {
    const text = ['// customer-pii-check-ignore: a street, not a person', 'const s = "June Street";'].join('\n');
    expect(findNames(text, ['June'], 'f.ts')).toEqual([]);
  });

  it('finds nothing when no roster is supplied', () => {
    expect(findNames('const who = "June Ward";', [], 'f.ts')).toEqual([]);
  });
});
