import { describe, expect, it } from 'vitest';
import {
  GIFT_CERTIFICATE_ITEM_NAME,
  isGiftCertificateItemName,
  isGiftCertificateLineItem,
} from './gift-certificate-item';

describe('isGiftCertificateItemName (#314)', () => {
  it('matches the exact register item name', () => {
    expect(isGiftCertificateItemName(GIFT_CERTIFICATE_ITEM_NAME)).toBe(true);
    expect(isGiftCertificateItemName('Gift certificate')).toBe(true);
  });

  it('ignores case and stray whitespace', () => {
    expect(isGiftCertificateItemName('Gift Certificate')).toBe(true);
    expect(isGiftCertificateItemName('GIFT CERTIFICATE')).toBe(true);
    expect(isGiftCertificateItemName('  gift   certificate ')).toBe(true);
  });

  it('does not match other names', () => {
    expect(isGiftCertificateItemName('Gift certificate holder')).toBe(false);
    expect(isGiftCertificateItemName('Gift certificates')).toBe(false);
    expect(isGiftCertificateItemName('Gift card')).toBe(false);
    expect(isGiftCertificateItemName('Hand-thrown mug')).toBe(false);
  });

  it('is false for a missing name', () => {
    expect(isGiftCertificateItemName(undefined)).toBe(false);
    expect(isGiftCertificateItemName(null)).toBe(false);
    expect(isGiftCertificateItemName('')).toBe(false);
  });
});

describe('isGiftCertificateLineItem (#314)', () => {
  it('reads the line item name', () => {
    expect(isGiftCertificateLineItem({ name: 'Gift certificate' })).toBe(true);
    expect(isGiftCertificateLineItem({ name: 'Guitar Lesson' })).toBe(false);
    expect(isGiftCertificateLineItem({})).toBe(false);
  });
});
