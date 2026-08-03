import { describe, expect, it, vi } from 'vitest';
import {
  buildMusicTogetherPurchaseEvent,
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
    pricePaidCents: 12500,
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

describe('buildMusicTogetherPurchaseEvent', () => {
  it('reports the amount charged in DOLLARS with USD currency', () => {
    const event = buildMusicTogetherPurchaseEvent(
      REG_ID,
      confirmed({ pricePaidCents: 12500 })
    );
    expect(event.customData).toMatchObject({ value: 125, currency: 'USD' });
  });

  // The deliberate decision: an installment registration reports installment 1
  // (what the card was actually charged), NOT the full tuition.
  it('reports installment 1 for an installment plan, not full tuition', () => {
    const event = buildMusicTogetherPurchaseEvent(
      REG_ID,
      confirmed({
        paymentPlan: 'installments',
        pricePaidCents: 7500,
        scheduledChargeCount: 1,
      })
    );
    expect(event.customData).toMatchObject({
      value: 75,
      payment_plan: 'installments',
      scheduled_charge_count: 1,
    });
  });

  it('rounds odd cents to a 2-decimal dollar value', () => {
    const event = buildMusicTogetherPurchaseEvent(
      REG_ID,
      confirmed({ pricePaidCents: 12533 })
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
