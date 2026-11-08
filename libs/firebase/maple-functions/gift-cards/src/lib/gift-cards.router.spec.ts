import { describe, it, expect, vi } from 'vitest';

/**
 * The giftCards router's wiring. A card's code is as good as cash, so every
 * route is pinned to admin only, with the Square credentials and nothing else.
 */
vi.mock('@maple/firebase/functions', () => {
  function builder() {
    const route = { roles: undefined as unknown, secrets: [] as string[], strings: [] as string[] };
    const chain = {
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

import { giftCards } from './gift-cards.router';

type Route = {
  roles: unknown;
  secrets: string[];
  strings: string[];
  handler: (...args: unknown[]) => unknown;
};
const routes = giftCards as unknown as Record<string, Route>;

describe('giftCards router', () => {
  it('has exactly the three read routes', () => {
    expect(Object.keys(routes).sort()).toEqual([
      'getGiftCard',
      'getGiftCards',
      'revealGiftCardCode',
    ]);
  });

  it.each(['getGiftCards', 'getGiftCard', 'revealGiftCardCode'])(
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
  });
});
