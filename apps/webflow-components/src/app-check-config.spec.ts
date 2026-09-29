import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

vi.mock('firebase/app', () => ({ getApps: () => [], initializeApp: vi.fn() }));
vi.mock('firebase/app-check', () => ({
  initializeAppCheck: vi.fn(),
  ReCaptchaEnterpriseProvider: class {},
  CustomProvider: class {},
}));
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(),
  connectFunctionsEmulator: vi.fn(),
}));

import { RECAPTCHA_ENTERPRISE_SITE_KEY } from './firebase-init';

/**
 * Enforcing App Check (ADR-034) while the widgets have no site key would
 * answer 401 to every widget call in that project. So an env file may only
 * say `enforce` once its project's key is configured in `firebase-init.ts`.
 */
function appCheckMode(envFile: string): string | undefined {
  // Vitest runs from the repo root.
  const text = readFileSync(resolve(process.cwd(), envFile), 'utf8');
  return /^APP_CHECK_MODE=(.*)$/m.exec(text)?.[1]?.trim().toLowerCase();
}

describe('App Check configuration', () => {
  it.each([
    ['.env.prod', 'prod'],
    ['.env.dev', 'dev'],
  ] as const)(
    '%s enforces only once the %s site key is set',
    (envFile, project) => {
      if (appCheckMode(envFile) === 'enforce') {
        expect(RECAPTCHA_ENTERPRISE_SITE_KEY[project]).not.toBe('');
      }
    }
  );
});
