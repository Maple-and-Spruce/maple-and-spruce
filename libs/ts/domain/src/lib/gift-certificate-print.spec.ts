import { describe, expect, it } from 'vitest';
import {
  GIFT_CERTIFICATE_BATCH_MAX,
  isAllowedCertificateQuantity,
  isGiftCertificateDesignId,
} from './gift-certificate-print';

describe('isAllowedCertificateQuantity', () => {
  it.each([1, 10, GIFT_CERTIFICATE_BATCH_MAX])('allows %s', (n) => {
    expect(isAllowedCertificateQuantity(n)).toBe(true);
  });
  it.each([0, -1, 51, 2.5, '5', undefined, Number.NaN])('refuses %s', (n) => {
    expect(isAllowedCertificateQuantity(n)).toBe(false);
  });
});

describe('isGiftCertificateDesignId', () => {
  it('knows the stained glass design', () => {
    expect(isGiftCertificateDesignId('stained-glass')).toBe(true);
  });
  it.each(['', 'pottery', undefined, 3])('refuses %s', (id) => {
    expect(isGiftCertificateDesignId(id)).toBe(false);
  });
});
