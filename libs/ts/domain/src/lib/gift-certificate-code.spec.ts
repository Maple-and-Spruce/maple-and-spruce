import { describe, expect, it } from 'vitest';
import {
  formatGiftCertificateCode,
  GIFT_CERTIFICATE_CODES_PER_YEAR,
  isGiftCertificateCode,
  makeGiftCertificateCode,
  redactGiftCertificateCodes,
  studioYear,
} from './gift-certificate-code';
import { formatGiftCardCode } from './gift-card-purchase';

const JULY_2099 = new Date('2099-07-04T15:00:00Z');

describe('makeGiftCertificateCode', () => {
  it('is MAPLE, the year and three digits from the random source', () => {
    expect(makeGiftCertificateCode(JULY_2099, () => 482)).toBe('MAPLE2099482');
  });

  it('pads small draws to three digits', () => {
    expect(makeGiftCertificateCode(JULY_2099, () => 7)).toBe('MAPLE2099007');
    expect(makeGiftCertificateCode(JULY_2099, () => 0)).toBe('MAPLE2099000');
  });

  it('asks the random source for a number below 1,000', () => {
    const asked: number[] = [];
    makeGiftCertificateCode(JULY_2099, (max) => {
      asked.push(max);
      return 999;
    });
    expect(asked).toEqual([GIFT_CERTIFICATE_CODES_PER_YEAR]);
  });

  it('refuses a random source that goes out of range', () => {
    expect(() => makeGiftCertificateCode(JULY_2099, () => 1000)).toThrow();
    expect(() => makeGiftCertificateCode(JULY_2099, () => -1)).toThrow();
    expect(() => makeGiftCertificateCode(JULY_2099, () => 1.5)).toThrow();
  });

  it('uses the studio year: 9pm on New Year’s Eve Eastern is still the old year', () => {
    // 02:00 UTC on Jan 1 is 9pm on Dec 31 in Morgantown.
    expect(makeGiftCertificateCode(new Date('2100-01-01T02:00:00Z'), () => 1)).toBe(
      'MAPLE2099001'
    );
    expect(studioYear(new Date('2100-01-01T06:00:00Z'))).toBe(2100);
  });
});

describe('isGiftCertificateCode', () => {
  it('knows a certificate code, with or without spaces', () => {
    expect(isGiftCertificateCode('MAPLE2099482')).toBe(true);
    expect(isGiftCertificateCode('MAPLE 2099 482')).toBe(true);
    expect(isGiftCertificateCode('maple2099482')).toBe(true);
  });
  it('rejects anything else', () => {
    expect(isGiftCertificateCode('7783320000004821')).toBe(false);
    expect(isGiftCertificateCode('MAPLE209948')).toBe(false);
    expect(isGiftCertificateCode('MAPLE20994821')).toBe(false);
  });
});

describe('formatting', () => {
  it('prints a certificate code as MAPLE, year, digits', () => {
    expect(formatGiftCertificateCode('MAPLE2099482')).toBe('MAPLE 2099 482');
    expect(formatGiftCardCode('MAPLE2099482')).toBe('MAPLE 2099 482');
  });
  it('leaves Square numbers in groups of four', () => {
    expect(formatGiftCertificateCode('7783320000004821')).toBeUndefined();
    expect(formatGiftCardCode('7783320000004821')).toBe('7783 3200 0000 4821');
  });
});

describe('redactGiftCertificateCodes', () => {
  it('hides every certificate code in a message', () => {
    expect(
      redactGiftCertificateCodes('GAN MAPLE2099482 already exists; MAPLE 2099 017 too')
    ).toBe('GAN MAPLE•••••••• already exists; MAPLE•••••••• too');
  });
});
