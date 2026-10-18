import { describe, it, expect, vi } from 'vitest';

/**
 * The productCatalog router's wiring. These routes write to the live Square
 * catalog, so the gate and the credentials each route asks for are pinned
 * exactly: admin and clerk, with the Square access token and strings and
 * nothing else.
 */

vi.mock('@maple/firebase/functions', () => {
  // A fresh builder per route that records what the chain asked for.
  function builder() {
    const route = {
      roles: undefined as unknown,
      secrets: [] as string[],
      strings: [] as string[],
    };
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
  SQUARE_STRING_NAMES: ['SQUARE_LOCATION_ID', 'SQUARE_ENVIRONMENT'],
}));

vi.mock('./create-product', () => ({ createProduct: vi.fn() }));
vi.mock('./update-product', () => ({ updateProduct: vi.fn() }));
vi.mock('./upload-product-image', () => ({ uploadProductImage: vi.fn() }));

import { productCatalog } from './product-catalog.router';
import { createProduct } from './create-product';
import { updateProduct } from './update-product';
import { uploadProductImage } from './upload-product-image';

type Route = {
  roles: unknown;
  secrets: string[];
  strings: string[];
  handler: unknown;
};
const routes = productCatalog as unknown as Record<string, Route>;

const handlers: Record<string, unknown> = {
  createProduct,
  updateProduct,
  uploadProductImage,
};

describe('productCatalog router', () => {
  it('has exactly these three routes', () => {
    expect(Object.keys(routes).sort()).toEqual(Object.keys(handlers).sort());
  });

  it.each(Object.keys(handlers))(
    '%s: admin and clerk, with the Square credentials and no others',
    (name) => {
      expect(routes[name].roles).toEqual(['admin', 'clerk']);
      expect(routes[name].secrets).toEqual(['SQUARE_ACCESS_TOKEN']);
      expect(routes[name].strings).toEqual([
        'SQUARE_LOCATION_ID',
        'SQUARE_ENVIRONMENT',
      ]);
    },
  );

  it('serves each route from its own handler', () => {
    for (const [name, route] of Object.entries(routes)) {
      expect(route.handler, name).toBe(handlers[name]);
    }
  });
});
