import { describe, expect, it } from 'vitest';
import { isIosNonSafari } from './add-to-calendar';

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
  iphoneFirefox:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15',
  iphoneInstagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0',
  ipadDesktopSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  macChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
};

describe('isIosNonSafari', () => {
  it('is false for Safari on iPhone, which opens an .ics in Calendar', () => {
    expect(isIosNonSafari(UA.iphoneSafari)).toBe(false);
  });

  it('is true for Chrome and Firefox on iPhone', () => {
    expect(isIosNonSafari(UA.iphoneChrome)).toBe(true);
    expect(isIosNonSafari(UA.iphoneFirefox)).toBe(true);
  });

  it('is true for an in-app browser on iPhone', () => {
    expect(isIosNonSafari(UA.iphoneInstagram)).toBe(true);
  });

  it('treats a touch "Mac" as an iPad, and its Safari as Safari', () => {
    expect(isIosNonSafari(UA.ipadDesktopSafari, 5)).toBe(false);
  });

  it('is false off iOS', () => {
    expect(isIosNonSafari(UA.macChrome)).toBe(false);
    expect(isIosNonSafari(UA.ipadDesktopSafari, 0)).toBe(false);
    expect(isIosNonSafari(UA.androidChrome, 5)).toBe(false);
  });
});
