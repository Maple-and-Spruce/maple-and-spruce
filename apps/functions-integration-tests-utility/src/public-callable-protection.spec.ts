/**
 * App Check (monitor mode) and request throttling on public callables,
 * end to end through the emulator (ADR-037).
 *
 * The builder's own spec covers the logic with the Admin SDK mocked; this
 * suite proves the deployed shape: the CORS preflight lets the App Check header
 * through, `APP_CHECK_MODE=monitor` from `.env.dev` reaches every codebase, and
 * the counters really persist in Firestore between calls.
 *
 * There is no App Check emulator, so `enforce` cannot be exercised here — it is
 * covered by `functions.utility.spec.ts`.
 *
 * Each test uses its own addresses and IPs (RFC 5737 documentation ranges) so
 * counts never leak between tests.
 */
import {
  clearFirestoreEmulator,
  callFunction,
  getFunctionUrl,
  listFirestoreDocs,
  setFirestoreDoc,
  EMULATOR_CONFIG,
} from '@maple/firebase/integration-test-utils';

function fromIp(ip: string): Record<string, string> {
  return { 'x-forwarded-for': ip };
}

function errorStatus(raw: unknown): string | undefined {
  return (raw as { error?: { status?: string } })?.error?.status;
}

describe('Public callable protection', () => {
  beforeAll(async () => {
    await clearFirestoreEmulator();
    await setFirestoreDoc('discounts', 'disc-protect', {
      code: 'PROTECT10',
      type: 'percent',
      description: 'Protection suite code',
      status: 'active',
      program: 'classes',
      appliesTo: 'order',
      nthSlot: 1,
      percent: 10,
      usageCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  afterAll(async () => {
    await clearFirestoreEmulator();
  });

  describe('App Check (monitor)', () => {
    it('CORS preflight allows the App Check header', async () => {
      const response = await fetch(getFunctionUrl('createRegistration'), {
        method: 'OPTIONS',
        headers: {
          Origin: EMULATOR_CONFIG.origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type,x-firebase-appcheck',
        },
      });

      expect(response.status).toBe(204);
      expect(
        response.headers.get('access-control-allow-headers')?.toLowerCase()
      ).toContain('x-firebase-appcheck');
    });

    it('still serves a call that carries no token', async () => {
      const result = await callFunction<{ code: string }, { discount?: unknown }>({
        functionName: 'lookupDiscount',
        data: { code: 'PROTECT10' },
        headers: fromIp('192.0.2.10'),
      });

      expect(result.status).toBe(200);
      expect(result.data?.discount).toBeDefined();
    });

    it('still serves a call whose token does not verify', async () => {
      const result = await callFunction<{ code: string }, { discount?: unknown }>({
        functionName: 'lookupDiscount',
        data: { code: 'PROTECT10' },
        headers: {
          ...fromIp('192.0.2.11'),
          'X-Firebase-AppCheck': 'not-a-real-token',
        },
      });

      expect(result.status).toBe(200);
      expect(result.data?.discount).toBeDefined();
    });
  });

  describe('throttling', () => {
    it('lookupDiscount: refuses one IP past its limit, not another', async () => {
      const limit = 30;
      for (let i = 0; i < limit; i++) {
        const ok = await callFunction({
          functionName: 'lookupDiscount',
          data: { code: `NOPE${i}` },
          headers: fromIp('198.51.100.20'),
        });
        expect(ok.status).toBe(200);
      }

      const refused = await callFunction({
        functionName: 'lookupDiscount',
        data: { code: 'PROTECT10' },
        headers: fromIp('198.51.100.20'),
      });
      expect(refused.status).toBe(429);
      expect(errorStatus(refused.raw)).toBe('RESOURCE_EXHAUSTED');

      const otherIp = await callFunction({
        functionName: 'lookupDiscount',
        data: { code: 'PROTECT10' },
        headers: fromIp('198.51.100.21'),
      });
      expect(otherIp.status).toBe(200);
    });

    it('counts the right-most forwarded address', async () => {
      // Varying the left-most entry must not dodge the count.
      for (let i = 0; i < 30; i++) {
        await callFunction({
          functionName: 'lookupDiscount',
          data: { code: 'NOPE' },
          headers: fromIp(`10.0.0.${i}, 198.51.100.30`),
        });
      }
      const refused = await callFunction({
        functionName: 'lookupDiscount',
        data: { code: 'NOPE' },
        headers: fromIp('10.0.1.1, 198.51.100.30'),
      });
      expect(refused.status).toBe(429);
    });

    it('createRegistration: refuses one email past its limit, before validation', async () => {
      // An incomplete body fails validation, which runs after throttling, so
      // no Square call is needed to exercise the count.
      const email = 'protect-reg@example.com';
      for (let i = 0; i < 8; i++) {
        const invalid = await callFunction({
          functionName: 'createRegistration',
          data: { customerEmail: email },
          headers: fromIp(`203.0.113.${40 + i}`),
        });
        expect(invalid.status).toBe(400);
      }

      const refused = await callFunction({
        functionName: 'createRegistration',
        data: { customerEmail: email },
        headers: fromIp('203.0.113.60'),
      });
      expect(refused.status).toBe(429);
      expect(errorStatus(refused.raw)).toBe('RESOURCE_EXHAUSTED');

      const otherEmail = await callFunction({
        functionName: 'createRegistration',
        data: { customerEmail: 'protect-reg-2@example.com' },
        headers: fromIp('203.0.113.61'),
      });
      expect(otherEmail.status).toBe(400);
    });

    it('requestCraftClubManageLink: refuses a fourth request for one address', async () => {
      const email = 'protect-link@example.com';
      for (let i = 0; i < 3; i++) {
        const ok = await callFunction<{ email: string }, { ok: boolean }>({
          functionName: 'requestCraftClubManageLink',
          data: { email },
          headers: fromIp(`203.0.113.${70 + i}`),
        });
        expect(ok.status).toBe(200);
      }

      const refused = await callFunction({
        functionName: 'requestCraftClubManageLink',
        data: { email: email.toUpperCase() },
        headers: fromIp('203.0.113.80'),
      });
      expect(refused.status).toBe(429);
    });

    it('stores hashed counters with a TTL expiry, never the raw address', async () => {
      const docs = await listFirestoreDocs('requestThrottles');

      expect(docs.length).toBeGreaterThan(0);
      for (const doc of docs) {
        expect(doc.id).not.toMatch(/@|example|198\.51|203\.0/);
        expect(doc.data['expiresAt']).toBeDefined();
        expect(typeof doc.data['count']).toBe('number');
      }
      expect(
        docs.some((doc) => doc.id.startsWith('requestCraftClubManageLink:email:'))
      ).toBe(true);
    });
  });
});
