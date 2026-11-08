import { describe, expect, it } from 'vitest';
import {
  formatGiftCardChange,
  formatGiftCardCode,
  formatGiftCardDate,
  formatGiftCardMoney,
  newGiftCardRequestKey,
  parseWholeDollars,
} from './format';

describe('gift card formatting', () => {
  it('formats money and signed changes', () => {
    expect(formatGiftCardMoney(1250)).toBe('$12.50');
    expect(formatGiftCardChange(2500)).toBe('+$25.00');
    expect(formatGiftCardChange(-3750)).toBe('−$37.50');
    expect(formatGiftCardChange(0)).toBe('$0.00');
  });

  it('shows dates in Eastern time', () => {
    // 3am UTC on Nov 15 is still Nov 14 in Morgantown.
    expect(formatGiftCardDate('2026-11-15T03:00:00Z')).toBe('Nov 14, 2026');
    expect(formatGiftCardDate('')).toBe('—');
  });

  it('groups a code in fours, as printed', () => {
    expect(formatGiftCardCode('7783320000004821')).toBe('7783 3200 0000 4821');
    expect(formatGiftCardCode('7783 3200 0000 4821')).toBe('7783 3200 0000 4821');
  });

  it('reads whole dollars as cents, and anything else as NaN', () => {
    expect(parseWholeDollars('25')).toBe(2500);
    expect(parseWholeDollars(' $25.00 ')).toBe(2500);
    expect(parseWholeDollars('500')).toBe(50000);
    expect(parseWholeDollars('25.50')).toBeNaN();
    expect(parseWholeDollars('')).toBeNaN();
    expect(parseWholeDollars('ten')).toBeNaN();
    expect(parseWholeDollars('-5')).toBeNaN();
  });

  it('makes a new request key each time, in the shape the server accepts', () => {
    const a = newGiftCardRequestKey();
    expect(a).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(newGiftCardRequestKey()).not.toBe(a);
  });
});
