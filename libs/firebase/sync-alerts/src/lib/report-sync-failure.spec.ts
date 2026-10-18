import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for reportSyncFailure: the email it queues, the per-record throttle,
 * and that it never throws into the trigger that called it.
 */

const mocks = vi.hoisted(() => ({
  isDev: false,
  throttleDoc: undefined as Record<string, unknown> | undefined,
  txSet: vi.fn(),
  txCreate: vi.fn(),
  runTransaction: vi.fn(),
}));

vi.mock('firebase-functions/params', () => ({
  defineString: vi.fn(() => ({ value: () => 'alerts@example.com' })),
}));

vi.mock('@maple/firebase/functions', () => ({
  FirebaseProject: {
    get isDev() {
      return mocks.isDev;
    },
  },
}));

vi.mock('@maple/firebase/database', () => {
  const docRef = (collection: string, id?: string) => ({
    collection,
    id: id ?? 'auto-id',
  });
  return {
    getDb: () => ({
      collection: (name: string) => ({
        doc: (id?: string) => docRef(name, id),
      }),
      runTransaction: mocks.runTransaction,
    }),
  };
});

import {
  ALERT_WINDOW_MS,
  buildSyncFailureEmail,
  reportSyncFailure,
  type SyncFailure,
} from './report-sync-failure';

const failure: SyncFailure = {
  source: 'syncClassToWebflow',
  destination: 'Webflow',
  entityType: 'class',
  entityId: 'class-123',
  entityLabel: 'Intro to Weaving',
  error: new Error('Webflow 429: rate limited'),
};

const NOW = new Date('2026-10-14T12:00:00Z');

function timestamp(date: Date) {
  return { toDate: () => date };
}

describe('reportSyncFailure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isDev = false;
    mocks.throttleDoc = undefined;
    mocks.runTransaction.mockImplementation(async (fn) =>
      fn({
        get: async () => ({
          exists: mocks.throttleDoc !== undefined,
          data: () => mocks.throttleDoc,
        }),
        set: mocks.txSet,
        create: mocks.txCreate,
      })
    );
  });

  it('queues an email to the alert address on the first failure', async () => {
    const queued = await reportSyncFailure(failure, NOW);

    expect(queued).toBe(true);
    expect(mocks.txCreate).toHaveBeenCalledWith(
      { collection: 'mail', id: 'auto-id' },
      {
        to: 'alerts@example.com',
        message: expect.objectContaining({
          subject: 'Webflow sync failed: class "Intro to Weaving"',
        }),
      }
    );
    expect(mocks.txSet).toHaveBeenCalledWith(
      { collection: 'syncFailureAlerts', id: 'syncClassToWebflow__class-123' },
      expect.objectContaining({ lastAlertedAt: NOW, suppressedCount: 0 })
    );
  });

  it('counts but does not email a repeat failure inside the window', async () => {
    mocks.throttleDoc = {
      lastAlertedAt: timestamp(new Date(NOW.getTime() - 60_000)),
      suppressedCount: 2,
    };

    const queued = await reportSyncFailure(failure, NOW);

    expect(queued).toBe(false);
    expect(mocks.txCreate).not.toHaveBeenCalled();
    expect(mocks.txSet).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'syncFailureAlerts' }),
      { suppressedCount: 3, lastFailedAt: NOW },
      { merge: true }
    );
  });

  it('emails again after the window, reporting the suppressed count', async () => {
    mocks.throttleDoc = {
      lastAlertedAt: timestamp(new Date(NOW.getTime() - ALERT_WINDOW_MS - 1)),
      suppressedCount: 4,
    };

    const queued = await reportSyncFailure(failure, NOW);

    expect(queued).toBe(true);
    const [, mail] = mocks.txCreate.mock.calls[0];
    expect(mail.message.text).toContain('failed 4 more times');
  });

  it('never throws when the alert itself fails', async () => {
    mocks.runTransaction.mockRejectedValue(new Error('Firestore down'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(reportSyncFailure(failure, NOW)).resolves.toBe(false);

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('keeps the throttle doc id free of slashes', async () => {
    await reportSyncFailure({ ...failure, entityId: 'a/b' }, NOW);

    expect(mocks.txSet).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'syncClassToWebflow__a_b' }),
      expect.anything()
    );
  });
});

describe('buildSyncFailureEmail', () => {
  it('names the record, function and error', () => {
    const { subject, text } = buildSyncFailureEmail(failure, 0, false);

    expect(subject).toBe('Webflow sync failed: class "Intro to Weaving"');
    expect(text).toContain('Record id: class-123');
    expect(text).toContain('Function: syncClassToWebflow');
    expect(text).toContain('Error: Webflow 429: rate limited');
    expect(text).not.toContain('more time');
  });

  it('prefixes dev alerts so they can be filtered', () => {
    expect(buildSyncFailureEmail(failure, 0, true).subject).toMatch(
      /^\[dev\] /
    );
  });

  it('falls back to the entity type when there is no label', () => {
    const { subject } = buildSyncFailureEmail(
      { ...failure, entityLabel: undefined, destination: 'Square' },
      0,
      false
    );
    expect(subject).toBe('Square sync failed: class');
  });

  it('uses the singular for one suppressed failure', () => {
    expect(buildSyncFailureEmail(failure, 1, false).text).toContain(
      'failed 1 more time for'
    );
  });

  it('describes a non-Error throw', () => {
    expect(
      buildSyncFailureEmail({ ...failure, error: { code: 503 } }, 0, false).text
    ).toContain('Error: {"code":503}');
  });
});
