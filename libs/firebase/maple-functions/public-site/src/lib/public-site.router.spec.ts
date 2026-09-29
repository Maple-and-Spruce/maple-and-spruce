import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * The publicSite router's wiring. Every route here is reachable by anyone on
 * the internet, so the spec pins that none of them asks for a role or a
 * secret, and that the one warm instance — the reason this router exists — is
 * set in prod and nowhere else.
 */

vi.mock('@maple/firebase/functions', () => {
  // A fresh builder per route that records what the chain asked for.
  function builder() {
    const route = {
      roles: undefined as unknown,
      secrets: [] as string[],
      strings: [] as string[],
      appCheck: undefined as string | undefined,
      throttle: undefined as unknown,
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
      withAppCheck: (mode: string) => {
        route.appCheck = mode;
        return chain;
      },
      throttling: (scope: string, rules: unknown) => {
        route.throttle = { scope, rules };
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
      router: (name: string, routes: unknown, runtime: unknown) => ({
        name,
        routes,
        runtime,
      }),
    },
    codeLookupThrottles: () => ['per-ip'],
  };
});

vi.mock('@maple/firebase/square', () => ({
  SQUARE_STRING_NAMES: ['SQUARE_LOCATION_ID', 'SQUARE_ENVIRONMENT'],
}));

vi.mock('./calculate-registration-cost', () => ({
  calculateRegistrationCost: vi.fn(),
}));
vi.mock('./get-public-class', () => ({ getPublicClass: vi.fn() }));
vi.mock('./get-public-music-together-demos', () => ({
  getPublicMusicTogetherDemos: vi.fn(),
}));
vi.mock('./get-public-music-together-section', () => ({
  getPublicMusicTogetherSection: vi.fn(),
}));
vi.mock('./get-public-music-together-sections', () => ({
  getPublicMusicTogetherSections: vi.fn(),
}));
vi.mock('./get-registration-status', () => ({
  getRegistrationStatus: vi.fn(),
}));
vi.mock('./get-required-agreements-for-class', () => ({
  getRequiredAgreementsForClass: vi.fn(),
}));
vi.mock('./lookup-discount', () => ({ lookupDiscount: vi.fn() }));

import { publicSite } from './public-site.router';
import { calculateRegistrationCost } from './calculate-registration-cost';
import { getPublicClass } from './get-public-class';
import { getPublicMusicTogetherDemos } from './get-public-music-together-demos';
import { getPublicMusicTogetherSection } from './get-public-music-together-section';
import { getPublicMusicTogetherSections } from './get-public-music-together-sections';
import { getRegistrationStatus } from './get-registration-status';
import { getRequiredAgreementsForClass } from './get-required-agreements-for-class';
import { lookupDiscount } from './lookup-discount';

type Route = {
  roles: unknown;
  secrets: string[];
  strings: string[];
  appCheck?: string;
  throttle?: unknown;
  handler: unknown;
};
type Router = {
  name: string;
  routes: Record<string, Route>;
  runtime: { minInstances?: number; concurrency?: number };
};
const router = publicSite as unknown as Router;

const handlers: Record<string, unknown> = {
  calculateRegistrationCost,
  getPublicClass,
  getPublicMusicTogetherDemos,
  getPublicMusicTogetherSection,
  getPublicMusicTogetherSections,
  getRegistrationStatus,
  getRequiredAgreementsForClass,
  lookupDiscount,
};

describe('publicSite router', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is deployed as publicSite with exactly these eight routes', () => {
    expect(router.name).toBe('publicSite');
    expect(Object.keys(router.routes).sort()).toEqual(
      Object.keys(handlers).sort(),
    );
  });

  it.each(Object.keys(handlers))('%s: public, and holds no secret', (name) => {
    expect(router.routes[name].roles).toBeUndefined();
    expect(router.routes[name].secrets).toEqual([]);
  });

  it('gives the Square location strings to calculateRegistrationCost only', () => {
    for (const [name, route] of Object.entries(router.routes)) {
      expect(route.strings, name).toEqual(
        name === 'calculateRegistrationCost'
          ? ['SQUARE_LOCATION_ID', 'SQUARE_ENVIRONMENT']
          : [],
      );
    }
  });

  it('verifies App Check and throttles per IP on lookupDiscount only', () => {
    for (const [name, route] of Object.entries(router.routes)) {
      if (name === 'lookupDiscount') {
        expect(route.appCheck, name).toBe('enforce');
        expect(route.throttle, name).toEqual({
          scope: 'lookupDiscount',
          rules: ['per-ip'],
        });
      } else {
        expect(route.appCheck, name).toBeUndefined();
        expect(route.throttle, name).toBeUndefined();
      }
    }
  });

  it('serves each route from its own handler', () => {
    for (const [name, route] of Object.entries(router.routes)) {
      expect(route.handler, name).toBe(handlers[name]);
    }
  });

  it('runs cold outside prod, at concurrency 80', () => {
    expect(router.runtime).toEqual({ minInstances: 0, concurrency: 80 });
  });

  it('keeps exactly one instance warm in prod', async () => {
    vi.stubEnv('GCLOUD_PROJECT', 'maple-and-spruce');
    vi.resetModules();
    const { publicSite: prod } = await import('./public-site.router');
    expect((prod as unknown as Router).runtime).toEqual({
      minInstances: 1,
      concurrency: 80,
    });
  });
});
