import {
  ADMIN_USER,
  NON_ADMIN_USER,
  callFunction,
  clearAuthEmulator,
  clearFirestoreEmulator,
  createTestUser,
  getFirestoreDoc,
  listFirestoreDocs,
  setFirestoreDoc,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';
import type {
  GeneratePayoutRequest,
  GeneratePayoutResponse,
  GetPayoutsRequest,
  GetPayoutsResponse,
  MarkPayoutPaidRequest,
  MarkPayoutPaidResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Artist consignment payouts on the payouts router, against the emulator.
 *
 * The property a unit test can't prove: a sale is never paid twice. Writing
 * the payout and stamping its sales happen in one transaction, so of two
 * generates racing for the same sales exactly one wins, and every sale ends
 * up on the winner.
 */

const route = (name: string) => `payouts/${name}`;

function message(result: { error?: unknown }): string {
  return (result.error as { message?: string } | undefined)?.message ?? '';
}

const created = new Date('2026-01-01T12:00:00Z');
const PERIOD = {
  periodStart: '2026-02-01T00:00:00.000Z',
  periodEnd: '2026-02-28T23:59:59.999Z',
};

function sale(artistId: string, soldAt: string, salePrice: number) {
  return {
    productId: 'prod-1',
    artistId,
    salePrice,
    quantitySold: 1,
    commission: salePrice * 0.2,
    artistEarnings: salePrice * 0.8,
    commissionRateApplied: 0.2,
    source: 'square',
    soldAt: new Date(soldAt),
    createdAt: new Date(soldAt),
  };
}

describe('artist payouts', () => {
  let admin: TestUser;
  let nonAdmin: TestUser;

  async function call<Req, Res>(name: string, data: Req, user: TestUser | null = admin) {
    return callFunction<Req, Res>({ functionName: route(name), data, idToken: user?.idToken });
  }

  const generate = (artistId: string) =>
    call<GeneratePayoutRequest, GeneratePayoutResponse>('generateArtistPayout', {
      artistId,
      ...PERIOD,
    });

  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();

    admin = await createTestUser(ADMIN_USER.email, ADMIN_USER.password);
    nonAdmin = await createTestUser(NON_ADMIN_USER.email, NON_ADMIN_USER.password);
    await setFirestoreDoc('admins', admin.uid, { userId: admin.uid, email: admin.email });

    const artist = (name: string) => ({
      name,
      email: `${name.toLowerCase().replace(/ /g, '.')}@example.com`,
      defaultCommissionRate: 0.2,
      status: 'active',
      createdAt: created,
      updatedAt: created,
    });
    await setFirestoreDoc('artists', 'artist-potter', artist('Test Potter'));
    await setFirestoreDoc('artists', 'artist-weaver', artist('Test Weaver'));

    await setFirestoreDoc('sales', 'sale-feb-1', sale('artist-potter', '2026-02-03T15:00:00Z', 50));
    await setFirestoreDoc('sales', 'sale-feb-2', sale('artist-potter', '2026-02-20T15:00:00Z', 100));
    // Outside the period: must not be swept in.
    await setFirestoreDoc('sales', 'sale-mar-1', sale('artist-potter', '2026-03-02T15:00:00Z', 40));
    // Another artist's sale in the same period: must not be swept in either.
    await setFirestoreDoc('sales', 'sale-weaver', sale('artist-weaver', '2026-02-10T15:00:00Z', 70));
  });

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  it('gates every route to admins', async () => {
    const routes: Array<[string, unknown]> = [
      ['getArtistPayouts', {}],
      ['generateArtistPayout', { artistId: 'artist-potter', ...PERIOD }],
      ['markArtistPayoutPaid', { payoutId: 'irrelevant', paymentMethod: 'check' }],
      ['getTeacherPayouts', { from: PERIOD.periodStart, to: PERIOD.periodEnd }],
    ];
    for (const [name, data] of routes) {
      expect((await call(name, data, null)).status, `${name} unauthenticated`).toBe(401);
      expect((await call(name, data, nonAdmin)).status, `${name} non-admin`).toBe(403);
    }
  });

  it('of two generates racing for the same sales, exactly one wins', async () => {
    const results = await Promise.all([generate('artist-potter'), generate('artist-potter')]);

    const winners = results.filter((r) => r.status === 200);
    const losers = results.filter((r) => r.status !== 200);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    // The loser either saw the winner's stamps inside its transaction, or
    // started after the winner committed and found nothing left unpaid.
    expect(message(losers[0])).toMatch(/just put on another payout|No unpaid sales/);

    const payout = winners[0].data!.payout;
    expect(payout).toMatchObject({
      artistId: 'artist-potter',
      saleCount: 2,
      totalSales: 150,
      totalCommission: 30,
      amountOwed: 120,
      status: 'pending',
    });
    expect([...payout.saleIds].sort()).toEqual(['sale-feb-1', 'sale-feb-2']);

    expect(await listFirestoreDocs('payouts')).toHaveLength(1);
    expect((await getFirestoreDoc('sales', 'sale-feb-1'))?.['payoutId']).toBe(payout.id);
    expect((await getFirestoreDoc('sales', 'sale-feb-2'))?.['payoutId']).toBe(payout.id);
    expect((await getFirestoreDoc('sales', 'sale-mar-1'))?.['payoutId']).toBeFalsy();
    expect((await getFirestoreDoc('sales', 'sale-weaver'))?.['payoutId']).toBeFalsy();
  });

  it('refuses to generate again once the period is paid out', async () => {
    const again = await generate('artist-potter');

    expect(again.status).toBe(400);
    expect(message(again)).toMatch(/No unpaid sales/);
  });

  it('lists payouts by artist, and marks one paid only once', async () => {
    const listed = await call<GetPayoutsRequest, GetPayoutsResponse>('getArtistPayouts', {
      artistId: 'artist-potter',
    });
    expect(listed.status).toBe(200);
    expect(listed.data!.payouts).toHaveLength(1);
    const [payout] = listed.data!.payouts;

    const none = await call<GetPayoutsRequest, GetPayoutsResponse>('getArtistPayouts', {
      artistId: 'artist-weaver',
    });
    expect(none.data!.payouts).toEqual([]);

    const paid = await call<MarkPayoutPaidRequest, MarkPayoutPaidResponse>('markArtistPayoutPaid', {
      payoutId: payout.id,
      paymentMethod: 'check',
      paymentReference: 'CHK-001',
    });
    expect(paid.status).toBe(200);
    expect(paid.data!.payout).toMatchObject({
      status: 'paid',
      paymentMethod: 'check',
      paymentReference: 'CHK-001',
    });

    const payTwice = await call<MarkPayoutPaidRequest, MarkPayoutPaidResponse>(
      'markArtistPayoutPaid',
      { payoutId: payout.id, paymentMethod: 'venmo' }
    );
    expect(payTwice.status).toBe(400);
    expect(message(payTwice)).toMatch(/already marked as 'paid'/);
  });
});
