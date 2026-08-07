import { describe, expect, it, vi } from 'vitest';
import {
  buildMusicTogetherPurchaseEvent,
  reportedValueCents,
  emitMusicTogetherPurchaseIfConfirmed,
  shouldEmitMusicTogetherPurchase,
  type MusicTogetherConversionData,
} from './send-music-together-conversion';

const REG_ID = 'mtreg123';

function confirmed(
  overrides: Partial<MusicTogetherConversionData> = {}
): MusicTogetherConversionData {
  return {
    sectionId: 'sec-1',
    email: 'family@example.com',
    phone: '304-555-0199',
    adultFirstName: 'Jane',
    adultLastName: 'Doe',
    pricePaidCents: 25200,
    totalCommittedCents: 25200,
    paymentPlan: 'full',
    scheduledChargeCount: 0,
    status: 'confirmed',
    ...overrides,
  };
}

describe('shouldEmitMusicTogetherPurchase', () => {
  it('fires on the pending -> confirmed transition', () => {
    expect(
      shouldEmitMusicTogetherPurchase({ status: 'pending' }, confirmed())
    ).toBe(true);
  });

  it('fires when a confirmed doc appears with no prior state', () => {
    expect(shouldEmitMusicTogetherPurchase(undefined, confirmed())).toBe(true);
  });

  // The MT doc is updated several more times after confirmation (scheduled
  // charge count, calendar token, cancellation fee). None of those may re-bill
  // Meta for the same enrollment.
  it('does NOT re-fire when an already-confirmed doc is edited', () => {
    expect(
      shouldEmitMusicTogetherPurchase(
        confirmed(),
        confirmed({ scheduledChargeCount: 1 })
      )
    ).toBe(false);
  });

  it('ignores non-confirmed states and deletions', () => {
    expect(
      shouldEmitMusicTogetherPurchase({ status: 'pending' }, {
        status: 'pending',
      })
    ).toBe(false);
    expect(
      shouldEmitMusicTogetherPurchase(confirmed(), { status: 'cancelled' })
    ).toBe(false);
    expect(shouldEmitMusicTogetherPurchase(confirmed(), undefined)).toBe(false);
  });

  it('requires money to have changed hands', () => {
    expect(
      shouldEmitMusicTogetherPurchase(
        { status: 'pending' },
        confirmed({ pricePaidCents: 0 })
      )
    ).toBe(false);
  });

  it('requires the match + catalog fields we cannot send without', () => {
    expect(
      shouldEmitMusicTogetherPurchase(
        { status: 'pending' },
        confirmed({ email: undefined })
      )
    ).toBe(false);
    expect(
      shouldEmitMusicTogetherPurchase(
        { status: 'pending' },
        confirmed({ sectionId: undefined })
      )
    ).toBe(false);
  });
});

/**
 * `reportedValueCents` is the whole value decision in one function, so it gets
 * its own block. See the value-semantics note at the top of the trigger: Meta's
 * `value` is the family's COMMITTED tuition, not the cash collected today,
 * because installment 2 lands outside the 7-day click window and could never be
 * attributed on its own.
 */
describe('reportedValueCents', () => {
  it('uses the committed total, not the registration-time charge', () => {
    expect(
      reportedValueCents({ pricePaidCents: 13200, totalCommittedCents: 26400 })
    ).toBe(26400);
  });

  it('is identical to the charge for a pay-in-full family', () => {
    expect(
      reportedValueCents({ pricePaidCents: 25200, totalCommittedCents: 25200 })
    ).toBe(25200);
  });

  // Registrations reserved before `totalCommittedCents` shipped still have a
  // conversion worth reporting; under-reporting one beats dropping it.
  it('falls back to the charge when the committed total is missing', () => {
    expect(reportedValueCents({ pricePaidCents: 13200 })).toBe(13200);
  });

  it('ignores a zero or negative committed total and falls back', () => {
    expect(
      reportedValueCents({ pricePaidCents: 13200, totalCommittedCents: 0 })
    ).toBe(13200);
    expect(
      reportedValueCents({ pricePaidCents: 13200, totalCommittedCents: -5 })
    ).toBe(13200);
  });

  it('is 0 when nothing is known (the gate rejects this before we send)', () => {
    expect(reportedValueCents({})).toBe(0);
  });
});

describe('buildMusicTogetherPurchaseEvent', () => {
  it('reports the committed tuition in DOLLARS with USD currency', () => {
    const event = buildMusicTogetherPurchaseEvent(REG_ID, confirmed());
    expect(event.customData).toMatchObject({ value: 252, currency: 'USD' });
  });

  /**
   * The reversed decision (was: installment 1). A 1-child installment family
   * commits 2 x $132 = $264 — MORE than the $252 pay-in-full price, because the
   * plan carries a premium. Reporting $132 would halve this cohort's apparent
   * value to Meta's bidder for no business reason.
   */
  it('reports the FULL committed plan total for an installment family', () => {
    const event = buildMusicTogetherPurchaseEvent(
      REG_ID,
      confirmed({
        paymentPlan: 'installments',
        pricePaidCents: 13200,
        totalCommittedCents: 26400,
        scheduledChargeCount: 1,
      })
    );
    expect(event.customData).toMatchObject({
      value: 264,
      payment_plan: 'installments',
      scheduled_charge_count: 1,
      // Cash timing stays visible even though `value` is the committed total.
      amount_paid_today: 132,
    });
  });

  // Sibling pricing must survive into the reported value: 2 kids on a plan is
  // 2 x $198 = $396, which is neither 2x the 1-child total nor a flat price.
  it('reports the sibling-discounted total for a multi-child installment family', () => {
    const twoChildren = buildMusicTogetherPurchaseEvent(
      REG_ID,
      confirmed({
        paymentPlan: 'installments',
        pricePaidCents: 19800,
        totalCommittedCents: 39600,
        scheduledChargeCount: 1,
      })
    );
    expect(twoChildren.customData).toMatchObject({
      value: 396,
      amount_paid_today: 198,
    });
    // Not 2x the one-child committed total ($528) — the 2nd child is 50% off.
    expect(twoChildren.customData?.['value']).not.toBe(528);

    const threeChildren = buildMusicTogetherPurchaseEvent(
      REG_ID,
      confirmed({
        paymentPlan: 'installments',
        pricePaidCents: 26400,
        totalCommittedCents: 52800,
        scheduledChargeCount: 1,
      })
    );
    expect(threeChildren.customData).toMatchObject({
      value: 528,
      amount_paid_today: 264,
    });
  });

  it('reports the sibling-discounted total for a multi-child pay-in-full family', () => {
    const event = buildMusicTogetherPurchaseEvent(
      REG_ID,
      confirmed({ pricePaidCents: 37800, totalCommittedCents: 37800 })
    );
    // 2 children paid in full: $252 * 1.5 = $378, and value === amount paid.
    expect(event.customData).toMatchObject({
      value: 378,
      amount_paid_today: 378,
      payment_plan: 'full',
    });
  });

  it('falls back to the charged amount for a pre-field registration', () => {
    const event = buildMusicTogetherPurchaseEvent(
      REG_ID,
      confirmed({
        paymentPlan: 'installments',
        pricePaidCents: 13200,
        totalCommittedCents: undefined,
        scheduledChargeCount: 1,
      })
    );
    expect(event.customData).toMatchObject({ value: 132 });
  });

  it('rounds odd cents to a 2-decimal dollar value', () => {
    const event = buildMusicTogetherPurchaseEvent(
      REG_ID,
      confirmed({ pricePaidCents: 12533, totalCommittedCents: 12533 })
    );
    expect(event.customData?.['value']).toBe(125.33);
  });

  it('keys content_ids to the section doc id', () => {
    const event = buildMusicTogetherPurchaseEvent(REG_ID, confirmed());
    expect(event.customData).toMatchObject({
      content_ids: ['sec-1'],
      content_type: 'product',
      content_category: 'music_together',
      num_items: 1,
    });
  });

  it('uses a stable, registration-derived event id for idempotent delivery', () => {
    expect(buildMusicTogetherPurchaseEvent(REG_ID, confirmed()).eventId).toBe(
      'mt-mtreg123'
    );
  });

  it('passes plain PII to the client (which hashes it) and cookies through', () => {
    const event = buildMusicTogetherPurchaseEvent(
      REG_ID,
      confirmed({
        fbp: 'fb.1.100.200',
        fbc: 'fb.1.100.click',
        eventSourceUrl: 'https://example.com/music-together/fall',
        clientIp: '203.0.113.9',
        clientUserAgent: 'Mozilla/5.0',
      })
    );
    expect(event.user).toEqual({
      email: 'family@example.com',
      phone: '304-555-0199',
      firstName: 'Jane',
      lastName: 'Doe',
      fbp: 'fb.1.100.200',
      fbc: 'fb.1.100.click',
      ip: '203.0.113.9',
      userAgent: 'Mozilla/5.0',
    });
    expect(event.eventSourceUrl).toBe(
      'https://example.com/music-together/fall'
    );
    expect(event.eventName).toBe('Purchase');
    expect(event.actionSource).toBe('website');
  });

  it('normalizes absent optional fields to undefined rather than null', () => {
    const event = buildMusicTogetherPurchaseEvent(
      REG_ID,
      confirmed({ fbp: null, fbc: null, clientIp: null, phone: null })
    );
    expect(event.user.fbp).toBeUndefined();
    expect(event.user.fbc).toBeUndefined();
    expect(event.user.ip).toBeUndefined();
    expect(event.user.phone).toBeUndefined();
    expect(event.eventSourceUrl).toBeUndefined();
  });
});

describe('emitMusicTogetherPurchaseIfConfirmed', () => {
  const logger = { log: vi.fn(), error: vi.fn() };

  it('sends exactly one Purchase on a fresh confirmation', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await expect(
      emitMusicTogetherPurchaseIfConfirmed(
        REG_ID,
        { status: 'pending' },
        confirmed(),
        send,
        logger
      )
    ).resolves.toBe(true);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0]).toMatchObject({ eventName: 'Purchase' });
  });

  it('does not send when the gate says no', async () => {
    const send = vi.fn();
    await expect(
      emitMusicTogetherPurchaseIfConfirmed(
        REG_ID,
        confirmed(),
        confirmed(),
        send,
        logger
      )
    ).resolves.toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  // Real money, real customers: the family is already charged and enrolled by
  // the time this runs. A CAPI outage must not throw (which would retry-loop
  // the Firestore trigger and could re-send the event repeatedly).
  it('swallows a send failure and reports false instead of throwing', async () => {
    const errorLogger = { log: vi.fn(), error: vi.fn() };
    const send = vi.fn().mockRejectedValue(new Error('Meta CAPI 500'));
    await expect(
      emitMusicTogetherPurchaseIfConfirmed(
        REG_ID,
        { status: 'pending' },
        confirmed(),
        send,
        errorLogger
      )
    ).resolves.toBe(false);
    expect(errorLogger.error).toHaveBeenCalledOnce();
  });
});
