import { describe, expect, it, vi } from 'vitest';
import {
  buildPurchaseEvent,
  emitPurchaseIfConfirmed,
  shouldEmitPurchase,
  splitName,
  type RegistrationConversionData,
} from './send-registration-conversion';

const silentLogger = { log: () => undefined, error: () => undefined };

const confirmed: RegistrationConversionData = {
  classId: 'cls_1',
  customerEmail: 'buyer@example.com',
  customerName: 'Jane Doe',
  customerPhone: '304-555-0100',
  quantity: 2,
  pricePaidCents: 10600,
  confirmationNumber: 'MS-ABC123',
  source: 'web',
  status: 'confirmed',
};

describe('shouldEmitPurchase', () => {
  it('fires on pending -> confirmed', () => {
    expect(
      shouldEmitPurchase({ ...confirmed, status: 'pending' }, confirmed)
    ).toBe(true);
  });

  it('fires on first write straight to confirmed (no before)', () => {
    expect(shouldEmitPurchase(undefined, confirmed)).toBe(true);
  });

  it('does NOT re-fire when already confirmed (later unrelated write)', () => {
    // A confirmed doc being written again (reminder timestamp, refund, etc.)
    // must not emit a second Purchase.
    expect(shouldEmitPurchase(confirmed, { ...confirmed })).toBe(false);
  });

  it('does not fire while still pending', () => {
    expect(
      shouldEmitPurchase(undefined, { ...confirmed, status: 'pending' })
    ).toBe(false);
  });

  it('does not fire on cancelled / refunded', () => {
    expect(
      shouldEmitPurchase({ ...confirmed, status: 'pending' }, {
        ...confirmed,
        status: 'cancelled',
      })
    ).toBe(false);
  });

  it('skips in-person POS registrations (not ad-driven)', () => {
    expect(shouldEmitPurchase(undefined, { ...confirmed, source: 'pos' })).toBe(
      false
    );
  });

  it('skips $0 registrations (free / fully discounted)', () => {
    expect(
      shouldEmitPurchase(undefined, { ...confirmed, pricePaidCents: 0 })
    ).toBe(false);
  });

  it('skips when classId or email is missing', () => {
    expect(
      shouldEmitPurchase(undefined, { ...confirmed, classId: undefined })
    ).toBe(false);
    expect(
      shouldEmitPurchase(undefined, { ...confirmed, customerEmail: undefined })
    ).toBe(false);
  });

  it('handles a deleted doc (no after)', () => {
    expect(shouldEmitPurchase(confirmed, undefined)).toBe(false);
  });
});

describe('splitName', () => {
  it('splits first and last', () => {
    expect(splitName('Jane Doe')).toEqual({
      firstName: 'Jane',
      lastName: 'Doe',
    });
  });
  it('keeps multi-word surnames', () => {
    expect(splitName('Mary Anne Van Der Berg')).toEqual({
      firstName: 'Mary',
      lastName: 'Anne Van Der Berg',
    });
  });
  it('single token -> first name only', () => {
    expect(splitName('Cher')).toEqual({ firstName: 'Cher' });
  });
  it('empty / undefined -> empty', () => {
    expect(splitName('   ')).toEqual({});
    expect(splitName(undefined)).toEqual({});
  });
});

describe('buildPurchaseEvent', () => {
  it('maps a confirmed registration to a dedup-keyed Purchase', () => {
    const event = buildPurchaseEvent(confirmed);

    expect(event).toMatchObject({
      eventName: 'Purchase',
      eventId: 'MS-ABC123', // dedup with the browser Pixel
      actionSource: 'website',
      user: {
        email: 'buyer@example.com',
        phone: '304-555-0100',
        firstName: 'Jane',
        lastName: 'Doe',
      },
      customData: {
        currency: 'USD',
        value: 106, // cents -> dollars
        content_ids: ['cls_1'], // catalog match id
        content_type: 'product',
        num_items: 2,
      },
    });
  });

  it('forwards fbp/fbc/event_source_url when present on the doc', () => {
    const event = buildPurchaseEvent({
      ...confirmed,
      fbp: 'fb.1.1.2',
      fbc: 'fb.1.1.click',
      eventSourceUrl: 'https://mapleandsprucefolkarts.com/classes/x',
    });
    expect(event.user.fbp).toBe('fb.1.1.2');
    expect(event.user.fbc).toBe('fb.1.1.click');
    expect(event.eventSourceUrl).toBe(
      'https://mapleandsprucefolkarts.com/classes/x'
    );
  });

  it('defaults num_items to 1 when quantity is absent', () => {
    const event = buildPurchaseEvent({ ...confirmed, quantity: undefined });
    expect(event.customData?.num_items).toBe(1);
  });
});

describe('emitPurchaseIfConfirmed', () => {
  it('sends the Purchase and reports success on a fresh confirmation', async () => {
    const send = vi.fn().mockResolvedValue(undefined);

    const sent = await emitPurchaseIfConfirmed(
      { ...confirmed, status: 'pending' },
      confirmed,
      send,
      silentLogger
    );

    expect(sent).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'Purchase', eventId: 'MS-ABC123' })
    );
  });

  it('does not send when the write is not a fresh confirmation', async () => {
    const send = vi.fn();
    const sent = await emitPurchaseIfConfirmed(confirmed, confirmed, send);
    expect(sent).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('swallows send failures (best-effort) and reports not-sent', async () => {
    const send = vi.fn().mockRejectedValue(new Error('CAPI 400'));
    const error = vi.fn();

    const sent = await emitPurchaseIfConfirmed(undefined, confirmed, send, {
      log: () => undefined,
      error,
    });

    expect(sent).toBe(false);
    expect(error).toHaveBeenCalledOnce();
  });
});
