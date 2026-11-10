import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@maple/firebase/database', () => ({
  RequestThrottleRepository: { hit: vi.fn() },
}));

import {
  checkThrottles,
  hashThrottleKey,
  Throttle,
  THROTTLE_LIMITS,
  paymentThrottles,
  emailLinkThrottles,
  codeLookupThrottles,
  GiftCardWrongCodeLockout,
  GIFT_CARD_LOCKED_OUT_MESSAGE,
  type ThrottleHitFn,
} from './throttle.utility';

/** An in-memory counter with the repository's contract. */
function memoryHit(): ThrottleHitFn & { buckets: Map<string, number> } {
  const buckets = new Map<string, number>();
  const fn = (async (bucketId: string, limit: number) => {
    const count = (buckets.get(bucketId) ?? 0) + 1;
    buckets.set(bucketId, count);
    return { allowed: count <= limit, count };
  }) as unknown as ThrottleHitFn & { buckets: Map<string, number> };
  fn.buckets = buckets;
  return fn;
}

describe('hashThrottleKey', () => {
  it('is stable, normalised and does not contain the input', () => {
    const a = hashThrottleKey('Robin@Example.com ');
    expect(a).toBe(hashThrottleKey('robin@example.com'));
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toContain('robin');
  });
});

describe('checkThrottles', () => {
  let hit: ReturnType<typeof memoryHit>;

  beforeEach(() => {
    hit = memoryHit();
  });

  it('allows up to the limit and refuses the next request', async () => {
    const rules = [Throttle.perField('email', 2, 3600)];
    const data = { email: 'robin@example.com' };
    expect(await checkThrottles('fn', rules, data, {}, hit)).toEqual({
      allowed: true,
    });
    expect(await checkThrottles('fn', rules, data, {}, hit)).toEqual({
      allowed: true,
    });
    expect(await checkThrottles('fn', rules, data, {}, hit)).toEqual({
      allowed: false,
      rule: 'email',
    });
  });

  it('keys bucket ids on scope + rule + hash, never the raw value', async () => {
    await checkThrottles(
      'createRegistration',
      paymentThrottles('customerEmail'),
      { customerEmail: 'robin@example.com' },
      { clientIp: '203.0.113.7' },
      hit
    );
    const ids = [...hit.buckets.keys()];
    expect(ids).toEqual([
      `createRegistration:ip:${hashThrottleKey('203.0.113.7')}`,
      `createRegistration:customerEmail:${hashThrottleKey('robin@example.com')}`,
    ]);
    expect(ids.join()).not.toContain('robin');
    expect(ids.join()).not.toContain('203.0.113.7');
  });

  it('counts separate callers separately', async () => {
    const rules = [Throttle.perClientIp(1, 60)];
    await checkThrottles('fn', rules, {}, { clientIp: '198.51.100.1' }, hit);
    const other = await checkThrottles(
      'fn',
      rules,
      {},
      { clientIp: '198.51.100.2' },
      hit
    );
    expect(other.allowed).toBe(true);
  });

  it('skips a rule whose key is absent or blank', async () => {
    const rules = [
      Throttle.perClientIp(1, 60),
      Throttle.perField('email', 1, 60),
    ];
    for (let i = 0; i < 3; i++) {
      const decision = await checkThrottles(
        'fn',
        rules,
        { email: '   ', other: 1 },
        {},
        hit
      );
      expect(decision.allowed).toBe(true);
    }
    expect(hit.buckets.size).toBe(0);
  });

  it('ignores a non-string field and a non-object body', async () => {
    const rules = [Throttle.perField('email', 1, 60)];
    expect(
      (await checkThrottles('fn', rules, { email: 42 }, {}, hit)).allowed
    ).toBe(true);
    expect((await checkThrottles('fn', rules, null, {}, hit)).allowed).toBe(
      true
    );
    expect(hit.buckets.size).toBe(0);
  });

  it('still counts the other rules after one refuses', async () => {
    const rules = [
      Throttle.perClientIp(1, 60),
      Throttle.perField('email', 5, 60),
    ];
    const ctx = { clientIp: '198.51.100.9' };
    await checkThrottles('fn', rules, { email: 'a@example.com' }, ctx, hit);
    const decision = await checkThrottles(
      'fn',
      rules,
      { email: 'a@example.com' },
      ctx,
      hit
    );
    expect(decision).toEqual({ allowed: false, rule: 'ip' });
    expect(hit.buckets.get(`fn:email:${hashThrottleKey('a@example.com')}`)).toBe(
      2
    );
  });

  it('fails open when the counter store errors', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken: ThrottleHitFn = async () => {
      throw new Error('unavailable');
    };
    const decision = await checkThrottles(
      'fn',
      [Throttle.perClientIp(1, 60)],
      {},
      { clientIp: '198.51.100.1' },
      broken
    );
    expect(decision).toEqual({ allowed: true });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('rule presets', () => {
  it('payment: per-IP and per-account at the documented limits', () => {
    const [ip, account] = paymentThrottles('sessionToken');
    expect(ip).toMatchObject({ name: 'ip', ...THROTTLE_LIMITS.payment.perIp });
    expect(account).toMatchObject({
      name: 'sessionToken',
      ...THROTTLE_LIMITS.payment.perAccount,
    });
    expect(account.key({ sessionToken: 's-1' }, {})).toBe('s-1');
  });

  it('email link: defaults to the email field', () => {
    const [ip, email] = emailLinkThrottles();
    expect(ip.key({}, { clientIp: '198.51.100.1' })).toBe('198.51.100.1');
    expect(email).toMatchObject({
      name: 'email',
      ...THROTTLE_LIMITS.emailLink.perAccount,
    });
  });

  it('code lookup: per-IP only', () => {
    const rules = codeLookupThrottles();
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({
      name: 'ip',
      ...THROTTLE_LIMITS.codeLookup.perIp,
    });
  });

  it('limits leave room for a family retrying a declined card', () => {
    expect(THROTTLE_LIMITS.payment.perAccount.limit).toBeGreaterThanOrEqual(10);
    expect(THROTTLE_LIMITS.emailLink.perAccount.limit).toBeGreaterThanOrEqual(3);
  });
});

describe('GiftCardWrongCodeLockout', () => {
  const { perIp, perAccount, everyone } = THROTTLE_LIMITS.giftCardWrongCode;
  const visitor = { clientIp: '192.0.2.10', email: 'robin@example.com' };

  /** A counter shared by record and check, as Firestore is. */
  function store() {
    const hit = memoryHit();
    const count = async (bucketId: string) => hit.buckets.get(bucketId) ?? 0;
    return { hit, count };
  }

  async function wrong(times: number, keys: object, hit: ThrottleHitFn) {
    for (let i = 0; i < times; i++) {
      await GiftCardWrongCodeLockout.recordWrongCode(keys, hit);
    }
  }

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('lets a visitor through after a mistyped number or two', async () => {
    const { hit, count } = store();
    await wrong(perIp.limit - 1, visitor, hit);
    await expect(GiftCardWrongCodeLockout.assertAllowed(visitor, count)).resolves.toBeUndefined();
  });

  it('refuses a visitor once their wrong numbers reach the limit', async () => {
    const { hit, count } = store();
    await wrong(perIp.limit, { clientIp: visitor.clientIp }, hit);
    await expect(
      GiftCardWrongCodeLockout.assertAllowed({ clientIp: visitor.clientIp }, count)
    ).rejects.toMatchObject({ code: 'resource-exhausted', message: GIFT_CARD_LOCKED_OUT_MESSAGE });
    // Another visitor is not affected.
    await expect(
      GiftCardWrongCodeLockout.assertAllowed({ clientIp: '192.0.2.99' }, count)
    ).resolves.toBeUndefined();
  });

  it('counts per email too, wherever the visitor is', async () => {
    const { hit, count } = store();
    for (let i = 0; i < perAccount.limit; i++) {
      await GiftCardWrongCodeLockout.recordWrongCode(
        { clientIp: `192.0.2.${i}`, email: visitor.email },
        hit
      );
    }
    await expect(
      GiftCardWrongCodeLockout.assertAllowed({ clientIp: '192.0.2.200', email: visitor.email }, count)
    ).rejects.toMatchObject({ code: 'resource-exhausted' });
  });

  it('pauses lookups for everyone once wrong numbers site-wide reach the cap', async () => {
    const { hit, count } = store();
    for (let i = 0; i < everyone.limit; i++) {
      await GiftCardWrongCodeLockout.recordWrongCode({ clientIp: `198.51.100.${i}` }, hit);
    }
    await expect(
      GiftCardWrongCodeLockout.assertAllowed({ clientIp: '203.0.113.1' }, count)
    ).rejects.toMatchObject({ code: 'resource-exhausted' });
  });

  it('stores no address or email, only hashes', async () => {
    const { hit } = store();
    await wrong(1, visitor, hit);
    const ids = [...hit.buckets.keys()].join(' ');
    expect(ids).not.toContain(visitor.clientIp);
    expect(ids).not.toContain(visitor.email);
    expect(ids).toContain(hashThrottleKey(visitor.clientIp));
  });

  it('fails open when the counters are down', async () => {
    const down = async () => {
      throw new Error('firestore down');
    };
    await expect(GiftCardWrongCodeLockout.assertAllowed(visitor, down)).resolves.toBeUndefined();
    await expect(
      GiftCardWrongCodeLockout.recordWrongCode(visitor, down as unknown as ThrottleHitFn)
    ).resolves.toBeUndefined();
  });
});
