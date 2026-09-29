import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  apps: [] as unknown[],
  initializeApp: vi.fn(),
  initializeAppCheck: vi.fn(),
  recaptchaKeys: [] as string[],
  customTokens: [] as Array<() => Promise<{ token: string }>>,
  connectFunctionsEmulator: vi.fn(),
}));

vi.mock('firebase/app', () => ({
  getApps: () => mocks.apps,
  initializeApp: (config: unknown) => {
    mocks.initializeApp(config);
    mocks.apps.push({ config });
  },
}));

vi.mock('firebase/app-check', () => ({
  initializeAppCheck: mocks.initializeAppCheck,
  ReCaptchaEnterpriseProvider: class {
    constructor(key: string) {
      mocks.recaptchaKeys.push(key);
    }
  },
  CustomProvider: class {
    constructor(options: { getToken: () => Promise<{ token: string }> }) {
      mocks.customTokens.push(options.getToken);
    }
  },
}));

vi.mock('firebase/functions', () => ({
  getFunctions: () => ({ __functions: true }),
  connectFunctionsEmulator: mocks.connectFunctionsEmulator,
}));

type Globals = { __MAPLE_APP_CHECK_TEST_TOKEN__?: string };

/** Fresh module per test: App Check starts once per page. */
async function load() {
  vi.resetModules();
  return import('./firebase-init.js');
}

describe('getWidgetFunctions → App Check', () => {
  beforeEach(() => {
    mocks.apps.length = 0;
    mocks.recaptchaKeys.length = 0;
    mocks.customTokens.length = 0;
    vi.clearAllMocks();
    vi.stubGlobal('window', {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (globalThis as Globals).__MAPLE_APP_CHECK_TEST_TOKEN__;
  });

  it('starts reCAPTCHA Enterprise App Check once the prod key is set', async () => {
    const mod = await load();
    mod.RECAPTCHA_ENTERPRISE_SITE_KEY.prod = 'site-key-prod';

    mod.getWidgetFunctions('prod');
    mod.getWidgetFunctions('prod');

    expect(mocks.initializeAppCheck).toHaveBeenCalledOnce();
    expect(mocks.recaptchaKeys).toEqual(['site-key-prod']);
    expect(mocks.initializeAppCheck.mock.calls[0][1]).toMatchObject({
      isTokenAutoRefreshEnabled: true,
    });
  });

  it('uses the dev key for the dev project', async () => {
    const mod = await load();
    mod.RECAPTCHA_ENTERPRISE_SITE_KEY.dev = 'site-key-dev';

    mod.getWidgetFunctions('dev');

    expect(mocks.recaptchaKeys).toEqual(['site-key-dev']);
  });

  it('skips App Check while the key is empty', async () => {
    const mod = await load();

    mod.getWidgetFunctions('prod');

    expect(mocks.initializeAppCheck).not.toHaveBeenCalled();
  });

  it('skips App Check against the emulator', async () => {
    const mod = await load();
    mod.RECAPTCHA_ENTERPRISE_SITE_KEY.dev = 'site-key-dev';

    mod.getWidgetFunctions('emulator');

    expect(mocks.initializeAppCheck).not.toHaveBeenCalled();
    expect(mocks.connectFunctionsEmulator).toHaveBeenCalled();
  });

  it('skips App Check during server rendering', async () => {
    vi.unstubAllGlobals();
    const mod = await load();
    mod.RECAPTCHA_ENTERPRISE_SITE_KEY.prod = 'site-key-prod';

    mod.getWidgetFunctions('prod');

    expect(mocks.initializeAppCheck).not.toHaveBeenCalled();
  });

  it('uses a fixed token when a story sets the test global', async () => {
    (globalThis as Globals).__MAPLE_APP_CHECK_TEST_TOKEN__ = 'story-token';
    const mod = await load();

    mod.getWidgetFunctions('emulator');

    expect(mocks.initializeAppCheck).toHaveBeenCalledOnce();
    expect(mocks.recaptchaKeys).toEqual([]);
    await expect(mocks.customTokens[0]()).resolves.toMatchObject({
      token: 'story-token',
    });
  });

  it('keeps the widget working if App Check fails to start', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.initializeAppCheck.mockImplementation(() => {
      throw new Error('already initialized');
    });
    const mod = await load();
    mod.RECAPTCHA_ENTERPRISE_SITE_KEY.prod = 'site-key-prod';

    expect(() => mod.getWidgetFunctions('prod')).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
