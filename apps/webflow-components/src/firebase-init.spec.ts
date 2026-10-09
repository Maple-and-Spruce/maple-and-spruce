import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The widget builds router URLs itself (it has no Next.js config to lean on),
 * and a wrong shape is a 404 on every public read — so both shapes are pinned.
 */

const mocks = vi.hoisted(() => ({
  apps: [] as unknown[],
  connectFunctionsEmulator: vi.fn(),
  httpsCallableFromURL: vi.fn((_fns: unknown, url: string) => url),
}));

vi.mock('firebase/app', () => ({
  initializeApp: (options: { projectId: string }) => {
    const app = { options };
    mocks.apps.push(app);
    return app;
  },
  getApps: () => mocks.apps,
}));

vi.mock('firebase/functions', () => ({
  getFunctions: () => ({ app: mocks.apps[0] }),
  connectFunctionsEmulator: mocks.connectFunctionsEmulator,
  httpsCallableFromURL: mocks.httpsCallableFromURL,
}));

import { getWidgetFunctions, routeCallable, routeUrl } from './firebase-init';

describe('router URLs from the widget', () => {
  beforeEach(() => {
    mocks.apps = [];
    vi.clearAllMocks();
  });

  it('addresses the deployed prod router', () => {
    const functions = getWidgetFunctions('prod');

    expect(routeUrl(functions, 'publicSite', 'getPublicClass')).toBe(
      'https://us-east4-maple-and-spruce.cloudfunctions.net/publicSite/getPublicClass',
    );
  });

  it('addresses the deployed dev router', () => {
    const functions = getWidgetFunctions('dev');

    expect(routeUrl(functions, 'publicSite', 'lookupDiscount')).toBe(
      'https://us-east4-maple-and-spruce-dev.cloudfunctions.net/publicSite/lookupDiscount',
    );
  });

  it('hands that URL to httpsCallableFromURL', () => {
    const functions = getWidgetFunctions('prod');

    routeCallable(functions, 'publicSite', 'getRegistrationStatus');

    expect(mocks.httpsCallableFromURL).toHaveBeenCalledWith(
      functions,
      'https://us-east4-maple-and-spruce.cloudfunctions.net/publicSite/getRegistrationStatus',
    );
  });

  // Last: connecting the emulator is module state that outlives the test.
  it("uses the emulator's path shape once the emulator is connected", () => {
    const functions = getWidgetFunctions('emulator');

    expect(mocks.connectFunctionsEmulator).toHaveBeenCalledWith(
      functions,
      '127.0.0.1',
      5001,
    );
    expect(
      routeUrl(functions, 'publicSite', 'getPublicMusicTogetherDemos'),
    ).toBe(
      'http://127.0.0.1:5001/maple-and-spruce-dev/us-east4/publicSite/getPublicMusicTogetherDemos',
    );
  });
});
