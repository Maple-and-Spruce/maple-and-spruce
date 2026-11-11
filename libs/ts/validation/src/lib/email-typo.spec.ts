import { describe, it, expect } from 'vitest';
import {
  KNOWN_EMAIL_DOMAIN_TYPOS,
  suggestEmailCorrection,
} from './email-typo';

/** Built at runtime so no real-looking address sits in the source. */
const at = (local: string, domain: string): string => `${local}@${domain}`;

describe('suggestEmailCorrection', () => {
  it.each([
    ['gnail.com', 'gmail.com'],
    ['gmial.com', 'gmail.com'],
    ['gmai.com', 'gmail.com'],
    ['gmail.con', 'gmail.com'],
    ['hotmial.com', 'hotmail.com'],
    ['yaho.com', 'yahoo.com'],
    ['outlok.com', 'outlook.com'],
    ['iclod.com', 'icloud.com'],
    ['comcast.con', 'comcast.net'],
  ])('suggests %s -> %s', (typo, fixed) => {
    expect(suggestEmailCorrection(at('robin', typo))).toBe(at('robin', fixed));
  });

  it.each([
    'gmail.com',
    'yahoo.com',
    'hotmail.com',
    'outlook.com',
    'icloud.com',
    'example.com',
    // Real providers one letter from a big one: never "corrected".
    'gmx.com',
    'ymail.com',
    'mail.com',
    'me.com',
    'yahoo.co.uk',
    'hotmail.co.uk',
    'live.ca',
  ])('leaves %s alone', (domain) => {
    expect(suggestEmailCorrection(at('robin', domain))).toBeUndefined();
  });

  it('keeps the part before the @ exactly as typed', () => {
    expect(suggestEmailCorrection(at('Robin.Ashfield+classes', 'gnail.com'))).toBe(
      at('Robin.Ashfield+classes', 'gmail.com')
    );
  });

  it('ignores the case of the domain and surrounding spaces', () => {
    expect(suggestEmailCorrection(`  ${at('robin', 'GNAIL.COM')}  `)).toBe(
      at('robin', 'gmail.com')
    );
  });

  it.each([undefined, null, '', '   ', 'robin', 'robin@', '@gnail.com', 'ro bin@gnail.com'])(
    'returns undefined for %j',
    (value) => {
      expect(suggestEmailCorrection(value)).toBeUndefined();
    }
  );

  it('uses the last @ for the domain', () => {
    expect(suggestEmailCorrection(at('a@b', 'gnail.com'))).toBe(
      at('a@b', 'gmail.com')
    );
  });

  describe('the list itself', () => {
    const entries = Object.entries(KNOWN_EMAIL_DOMAIN_TYPOS);

    it('is all lowercase', () => {
      for (const [typo, fixed] of entries) {
        expect(typo).toBe(typo.toLowerCase());
        expect(fixed).toBe(fixed.toLowerCase());
      }
    });

    it('never corrects to something it would correct again', () => {
      for (const [, fixed] of entries) {
        expect(KNOWN_EMAIL_DOMAIN_TYPOS[fixed]).toBeUndefined();
      }
    });

    it('never maps a domain to itself', () => {
      for (const [typo, fixed] of entries) {
        expect(typo).not.toBe(fixed);
      }
    });
  });
});
