import { describe, it, expect, vi } from 'vitest';

/**
 * The giftCards router's wiring. A card's code is as good as cash, so every
 * read route is pinned to admin only, with the Square credentials and nothing
 * else. The one public route, `purchaseGiftCard`, is pinned to App Check
 * enforce and the payment throttles instead.
 */
vi.mock('@maple/firebase/functions', () => {
  function builder() {
    const route = {
      roles: undefined as unknown,
      appCheck: undefined as unknown,
      throttle: undefined as unknown,
      secrets: [] as string[],
      strings: [] as string[],
    };
    const chain = {
      withAppCheck: (mode: unknown) => {
        route.appCheck = mode;
        return chain;
      },
      throttling: (scope: unknown, rules: unknown) => {
        route.throttle = { scope, rules };
        return chain;
      },
      requiringRole: (roles: unknown) => {
        route.roles = roles;
        return chain;
      },
      usingSecrets: (...names: string[]) => {
        route.secrets.push(...names);
        return chain;
      },
      usingStrings: (...names: string[]) => {
        route.strings.push(...names);
        return chain;
      },
      asRoute: (handler: unknown) => ({ ...route, handler }),
    };
    return chain;
  }
  return {
    Functions: {
      get endpoint() {
        return builder();
      },
      router: (_name: string, routes: unknown) => routes,
    },
    Role: { Admin: 'admin', Clerk: 'clerk' },
    codeLookupThrottles: () => ['per-ip'],
    paymentThrottles: (field: string) => [`payment:${field}`],
  };
});

vi.mock('@maple/firebase/square', () => ({
  SQUARE_SECRET_NAMES: ['SQUARE_ACCESS_TOKEN'],
  SQUARE_STRING_NAMES: ['SQUARE_ENV', 'SQUARE_LOCATION_ID', 'SALES_TAX_RATE'],
}));

const handlers = vi.hoisted(() => ({
  getGiftCards: vi.fn().mockResolvedValue('list'),
  getGiftCard: vi.fn(),
  revealGiftCardCode: vi.fn(),
}));
vi.mock('./gift-cards.handlers', () => handlers);
const preview = vi.hoisted(() => ({ previewGiftCardForClass: vi.fn() }));
vi.mock('./preview-gift-card-for-class', () => preview);
const purchase = vi.hoisted(() => ({ purchaseGiftCard: vi.fn() }));
vi.mock('./purchase-gift-card', () => purchase);
const adminActions = vi.hoisted(() => ({
  issueGiftCard: vi.fn(),
  markClassCertificate: vi.fn(),
}));
vi.mock('./gift-card-admin-actions', () => adminActions);
const printing = vi.hoisted(() => ({
  printGiftCertificates: vi.fn(),
  getCertificateBatch: vi.fn(),
}));
vi.mock('./print-gift-certificates', () => printing);
const customers = vi.hoisted(() => ({
  getGiftCardBuyer: vi.fn(),
  searchGiftCardsByCustomer: vi.fn().mockResolvedValue('found'),
}));
vi.mock('./gift-card-customers', () => customers);
const replacing = vi.hoisted(() => ({ replaceGiftCard: vi.fn() }));
vi.mock('./replace-gift-card', () => replacing);
const closing = vi.hoisted(() => ({ closeGiftCard: vi.fn() }));
vi.mock('./close-gift-card', () => closing);

import { giftCards } from './gift-cards.router';

type Route = {
  roles: unknown;
  appCheck?: unknown;
  throttle?: unknown;
  secrets: string[];
  strings: string[];
  handler: (...args: unknown[]) => unknown;
};
const routes = giftCards as unknown as Record<string, Route>;

describe('giftCards router', () => {
  it('has the admin reads, the admin actions, the checkout preview and the public purchase', () => {
    expect(Object.keys(routes).sort()).toEqual([
      'closeGiftCard',
      'getCertificateBatch',
      'getGiftCard',
      'getGiftCardBuyer',
      'getGiftCards',
      'issueGiftCard',
      'markClassCertificate',
      'previewGiftCardForClass',
      'printGiftCertificates',
      'purchaseGiftCard',
      'replaceGiftCard',
      'revealGiftCardCode',
      'searchGiftCardsByCustomer',
    ]);
  });

  it('previewGiftCardForClass is public, App Check enforced and throttled (#301)', () => {
    const route = routes['previewGiftCardForClass'];
    expect(route.roles).toBeUndefined();
    expect(route.appCheck).toBe('enforce');
    expect(route.throttle).toEqual({ scope: 'previewGiftCardForClass', rules: ['per-ip'] });
    expect(route.secrets).toEqual(['SQUARE_ACCESS_TOKEN']);
    expect(route.handler).toBe(preview.previewGiftCardForClass);
  });

  it('purchaseGiftCard is public, App Check enforced and throttled per buyer', () => {
    const route = routes['purchaseGiftCard'];
    expect(route.roles).toBeUndefined();
    expect(route.appCheck).toBe('enforce');
    expect(route.throttle).toEqual({
      scope: 'purchaseGiftCard',
      rules: ['payment:buyerEmail'],
    });
    expect(route.secrets).toEqual(['SQUARE_ACCESS_TOKEN']);
    expect(route.strings).toEqual([
      'SQUARE_ENV',
      'SQUARE_LOCATION_ID',
      'SALES_TAX_RATE',
      'ADMIN_ALERT_EMAIL',
    ]);
    expect(route.handler).toBe(purchase.purchaseGiftCard);
  });

  it.each([
    'getGiftCards',
    'getGiftCard',
    'revealGiftCardCode',
    'markClassCertificate',
    'issueGiftCard',
    'printGiftCertificates',
    'getCertificateBatch',
    'getGiftCardBuyer',
    'searchGiftCardsByCustomer',
    'replaceGiftCard',
    'closeGiftCard',
  ])(
    '%s is admin only, with the Square credentials',
    (name) => {
      expect(routes[name].roles).toBe('admin');
      expect(routes[name].secrets).toEqual(['SQUARE_ACCESS_TOKEN']);
      expect(routes[name].strings).toEqual(['SQUARE_ENV', 'SQUARE_LOCATION_ID', 'SALES_TAX_RATE']);
    }
  );

  it('routes to the handlers', async () => {
    await routes['getGiftCards'].handler({}, {}, { a: 1 }, { b: 2 });
    expect(handlers.getGiftCards).toHaveBeenCalledWith({}, {}, { a: 1 }, { b: 2 });
    expect(routes['getGiftCard'].handler).toBe(handlers.getGiftCard);
    expect(routes['revealGiftCardCode'].handler).toBe(handlers.revealGiftCardCode);
    expect(routes['markClassCertificate'].handler).toBe(adminActions.markClassCertificate);
    expect(routes['issueGiftCard'].handler).toBe(adminActions.issueGiftCard);
    await routes['printGiftCertificates'].handler({ q: 1 }, {}, { a: 1 }, { b: 2 });
    expect(printing.printGiftCertificates).toHaveBeenCalledWith({ q: 1 }, {}, { a: 1 }, { b: 2 });
    expect(routes['getCertificateBatch'].handler).toBe(printing.getCertificateBatch);
    expect(routes['getGiftCardBuyer'].handler).toBe(customers.getGiftCardBuyer);
    expect(await routes['searchGiftCardsByCustomer'].handler({ query: 'x' }, {}, {}, {})).toBe(
      'found'
    );
    expect(customers.searchGiftCardsByCustomer).toHaveBeenCalledWith({ query: 'x' }, {}, {}, {});
    expect(routes['replaceGiftCard'].handler).toBe(replacing.replaceGiftCard);
    expect(routes['closeGiftCard'].handler).toBe(closing.closeGiftCard);
  });

  it('the admin actions are not public: no App Check bypass, no throttle', () => {
    for (const name of [
      'markClassCertificate',
      'issueGiftCard',
      'printGiftCertificates',
      'getCertificateBatch',
      'getGiftCardBuyer',
      'searchGiftCardsByCustomer',
      'replaceGiftCard',
      'closeGiftCard',
    ]) {
      expect(routes[name].appCheck).toBeUndefined();
      expect(routes[name].throttle).toBeUndefined();
    }
  });
});
