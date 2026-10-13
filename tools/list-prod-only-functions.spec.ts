/**
 * Scheduled functions deploy to prod only, so dev carries no Cloud Scheduler
 * jobs. The dev deploy filter is built from this list.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, it, expect } from 'vitest';
import { importsScheduler, scheduledLibraries } from './list-prod-only-functions';

describe('importsScheduler', () => {
  it('sees the v2 scheduler import', () => {
    expect(
      importsScheduler(`import { onSchedule } from 'firebase-functions/v2/scheduler';`)
    ).toBe(true);
  });

  it('sees the unversioned scheduler import', () => {
    expect(
      importsScheduler(`import { onSchedule } from 'firebase-functions/scheduler';`)
    ).toBe(true);
  });

  it('ignores a type-only import, which defines no job', () => {
    expect(
      importsScheduler(`import type { ScheduledEvent } from 'firebase-functions/v2/scheduler';`)
    ).toBe(false);
  });

  it('ignores the word onSchedule outside an import', () => {
    // The lessons domain talks about `onSchedule` lessons; that is not a job.
    expect(importsScheduler(`const onSchedule = lessons.filter((l) => l.onSchedule);`)).toBe(
      false
    );
  });

  it('ignores a twin that imports the scheduled library’s logic', () => {
    expect(
      importsScheduler(
        `import { runSendClassReminders } from '@maple/firebase/maple-functions/send-class-reminders';`
      )
    ).toBe(false);
  });
});

describe('scheduledLibraries', () => {
  let dir: string;

  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  function lib(slug: string, files: Record<string, string>): void {
    for (const [rel, source] of Object.entries(files)) {
      const file = path.join(dir, slug, 'src', rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, source);
    }
  }

  it('lists only libraries whose own source schedules a job', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prod-only-'));
    lib('nightly-job', {
      'index.ts': `export * from './lib/nightly-job';`,
      'lib/nightly-job.ts': `import { onSchedule } from 'firebase-functions/v2/scheduler';`,
    });
    lib('trigger-nightly-job', {
      'lib/trigger-nightly-job.ts': `import { run } from '@maple/firebase/maple-functions/nightly-job';`,
    });
    lib('only-a-spec-mentions-it', {
      'lib/thing.ts': `export const x = 1;`,
      'lib/thing.spec.ts': `vi.mock('firebase-functions/v2/scheduler');\nimport { onSchedule } from 'firebase-functions/v2/scheduler';`,
    });

    expect(scheduledLibraries(dir)).toEqual(['nightly-job']);
  });

  it('finds the real scheduled jobs and leaves their run-now twins in dev', () => {
    const found = scheduledLibraries();
    expect(found).toEqual(
      expect.arrayContaining([
        'release-stale-registration-holds',
        'send-class-reminders',
        'sync-lesson-inquiries',
        'run-lesson-billing',
      ])
    );
    for (const twin of [
      'trigger-class-reminders',
      'trigger-music-together-installments',
      'trigger-music-together-reminders',
      'trigger-lesson-inquiry-sync',
      'lesson-payments',
    ]) {
      expect(found).not.toContain(twin);
    }
  });
});
