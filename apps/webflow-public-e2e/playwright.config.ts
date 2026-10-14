import { defineConfig, devices } from '@playwright/test';
import { STAGING_URL } from './src/site';

/**
 * Public Webflow pages smoke suite — READ-ONLY.
 *
 * Loads the real, published Webflow site (no harness, no emulator, no seed)
 * and checks that the page-level redesign scripts on /upcoming-classes and
 * the class template ran and left a usable page. Nothing is typed, submitted
 * or paid for: the specs only read the DOM, click filter chips and follow
 * links.
 *
 * Target with `WEBFLOW_BASE_URL`:
 *   - staging (default) https://maple-spruce-folk-arts-collective.webflow.io
 *   - prod              https://mapleandsprucefolkarts.com
 *
 * Webflow publishes don't come from repo PRs, so this runs on a daily
 * schedule + manual dispatch (`.github/workflows/webflow-public-e2e.yml`),
 * not as a PR check.
 */
const configured = process.env['WEBFLOW_BASE_URL'] || STAGING_URL;
const baseURL = configured.endsWith('/') ? configured.slice(0, -1) : configured;

export default defineConfig({
  testDir: './src',
  testMatch: '**/*.spec.ts',
  // A live site over the public internet: one retry absorbs a CDN hiccup or a
  // cold registration-widget callable.
  retries: process.env['CI'] ? 1 : 0,
  // Read-only, so parallel workers are safe — but keep it modest so a daily
  // run doesn't hammer the shop's site.
  workers: 2,
  reporter: process.env['CI']
    ? [['html', { open: 'never' }], ['list']]
    : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // iPhone-sized viewport on chromium (so CI only installs one browser).
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 393, height: 852 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
