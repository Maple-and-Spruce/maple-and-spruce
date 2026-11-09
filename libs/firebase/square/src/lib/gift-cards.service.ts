/**
 * Square Gift Cards API service (#295).
 *
 * Square is the only record of a gift card: its balance, its code (the GAN)
 * and its history. This service reads them back for the admin. It maps
 * Square's shapes onto `@maple/ts/domain` gift card types, and keeps the full
 * code out of every list: only `getGiftCardCode` returns it.
 *
 * @see https://developer.squareup.com/docs/gift-cards/using-gift-cards-api
 */
import type { Square, SquareClient } from 'square';
import type {
  GiftCardActivityEntry,
  GiftCardActivityType,
  GiftCardKind,
  GiftCardState,
  GiftCardSummary,
} from '@maple/ts/domain';
import { giftCardActivityDirection } from '@maple/ts/domain';

export interface ListGiftCardActivitiesInput {
  /** One card's history. Omit for every card's. */
  giftCardId?: string;
  /** Inclusive start (default: Square's, one year ago). */
  beginTime?: Date;
  /** Inclusive end (default: now). */
  endTime?: Date;
  /** Only this kind of activity, e.g. `ACTIVATE`. */
  type?: Square.GiftCardActivityType;
}

/** Square's default history window; just under a year to stay inside it. */
const HISTORY_WINDOW_MS = 360 * 24 * 60 * 60 * 1000;

export class GiftCardsService {
  constructor(private readonly client: SquareClient) {}

  /**
   * Every gift card on the account, newest first.
   *
   * `giftCards.list` returns an async-iterable Page that fetches further pages
   * itself; reading only `.data` would silently stop at the first 200.
   */
  async listGiftCards(): Promise<GiftCardSummary[]> {
    const page = await this.client.giftCards.list({ limit: 200 });
    const out: GiftCardSummary[] = [];
    for await (const card of page) {
      const summary = toGiftCardSummary(card);
      if (summary) out.push(summary);
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** One card, or undefined when Square has no card with that id. */
  async getGiftCard(id: string): Promise<GiftCardSummary | undefined> {
    const card = await this.retrieve(id);
    return card ? toGiftCardSummary(card) : undefined;
  }

  /**
   * The card's full code, for printing on a certificate. Only call this when a
   * person has asked to see it: the code is as good as cash.
   */
  async getGiftCardCode(id: string): Promise<string | undefined> {
    const card = await this.retrieve(id);
    return card?.gan ?? undefined;
  }

  /**
   * The Square customers linked to a card (#332). Square links a customer
   * when a card is sold to one at the register or saved to their profile.
   */
  async getLinkedCustomerIds(id: string): Promise<string[]> {
    const card = await this.retrieve(id);
    return card?.customerIds ?? [];
  }

  /** Every card linked to one Square customer (#332), newest first. */
  async listGiftCardsForCustomer(customerId: string): Promise<GiftCardSummary[]> {
    const page = await this.client.giftCards.list({ customerId, limit: 200 });
    const out: GiftCardSummary[] = [];
    for await (const card of page) {
      const summary = toGiftCardSummary(card);
      if (summary) out.push(summary);
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * Activities across every card in `[since, now]`, newest first, read in
   * windows of just under a year (Square's longest range). Used to find which
   * orders loaded which cards (#332).
   */
  async listActivitiesSince(
    since: Date,
    type: Square.GiftCardActivityType,
    now: Date = new Date()
  ): Promise<GiftCardActivityEntry[]> {
    const out: GiftCardActivityEntry[] = [];
    let end = now.getTime();
    while (end > since.getTime()) {
      const begin = Math.max(since.getTime(), end - HISTORY_WINDOW_MS);
      out.push(
        ...(await this.listActivities({
          type,
          beginTime: new Date(begin),
          endTime: new Date(end),
        }))
      );
      end = begin - 1;
    }
    return out;
  }

  /** Activities, newest first. Follows every page. */
  async listActivities(
    input: ListGiftCardActivitiesInput = {}
  ): Promise<GiftCardActivityEntry[]> {
    const page = await this.client.giftCards.activities.list({
      giftCardId: input.giftCardId,
      beginTime: input.beginTime?.toISOString(),
      endTime: input.endTime?.toISOString(),
      type: input.type,
      sortOrder: 'DESC',
      limit: 100,
    });
    const out: GiftCardActivityEntry[] = [];
    for await (const activity of page) {
      const entry = toGiftCardActivityEntry(activity);
      if (entry) out.push(entry);
    }
    return out;
  }

  /**
   * One card's whole history, newest first.
   *
   * Square searches the last year when no time range is given, and rejected a
   * start time on its own ("Time range provided is not valid") when we asked
   * for history from the card's creation date. So a card under a year old is
   * read with no range at all, the shape that always works, and an older card
   * is read in one-year windows that each have both a start and an end, like
   * the month totals query.
   */
  async listCardHistory(
    giftCardId: string,
    createdAt: string,
    now: Date = new Date()
  ): Promise<GiftCardActivityEntry[]> {
    const created = Date.parse(createdAt);
    if (!Number.isFinite(created) || now.getTime() - created < HISTORY_WINDOW_MS) {
      return this.listActivities({ giftCardId });
    }

    const out: GiftCardActivityEntry[] = [];
    let end = now.getTime();
    while (end > created) {
      const begin = Math.max(created - 1000, end - HISTORY_WINDOW_MS);
      const window = await this.listActivities({
        giftCardId,
        beginTime: new Date(begin),
        endTime: new Date(end),
      });
      for (const entry of window) {
        if (!out.some((e) => e.id === entry.id)) out.push(entry);
      }
      end = begin - 1;
    }
    return out;
  }

  /**
   * A new eGift card with no money on it (`PENDING` until activated). Square
   * picks the code. Returns the full code so the caller can email it; the
   * caller must never store it.
   */
  async createDigitalGiftCard(input: {
    locationId: string;
    idempotencyKey: string;
    /**
     * A code the studio chose (8 to 20 letters and digits). Omit to let
     * Square number the card.
     */
    gan?: string;
  }): Promise<{ id: string; gan: string; last4: string }> {
    const response = await this.client.giftCards.create({
      idempotencyKey: input.idempotencyKey,
      locationId: input.locationId,
      giftCard: input.gan
        ? { type: 'DIGITAL', gan: input.gan, ganSource: 'OTHER' }
        : { type: 'DIGITAL' },
    });
    throwIfGiftCardErrors(response.errors, 'create gift card');
    const card = response.giftCard;
    if (!card?.id || !card.gan) {
      throw new Error('Square gift card create returned no id or code');
    }
    return { id: card.id, gan: card.gan, last4: card.gan.slice(-4) };
  }

  /**
   * Put the money on a new card, tied to the Square order that sold it. The
   * order must contain a `GIFT_CARD` line item for the same amount and be
   * paid; Square takes the amount from that line, so none is passed here.
   *
   * @see https://developer.squareup.com/docs/gift-cards/using-gift-cards-api#activate-a-gift-card
   */
  async activateGiftCard(input: {
    giftCardId: string;
    locationId: string;
    orderId: string;
    lineItemUid: string;
    idempotencyKey: string;
  }): Promise<{ balanceCents: number }> {
    const response = await this.client.giftCards.activities.create({
      idempotencyKey: input.idempotencyKey,
      giftCardActivity: {
        type: 'ACTIVATE',
        locationId: input.locationId,
        giftCardId: input.giftCardId,
        activateActivityDetails: {
          orderId: input.orderId,
          lineItemUid: input.lineItemUid,
        },
      },
    });
    throwIfGiftCardErrors(response.errors, 'activate gift card');
    return {
      balanceCents: cents(response.giftCardActivity?.giftCardBalanceMoney) ?? 0,
    };
  }

  /**
   * Put money on a new card that was not sold through a Square order: a free
   * card the studio gives (#310). Square's path for value from outside its
   * Orders API is an `ACTIVATE` with the amount, a `referenceId` tying it to
   * our record, and `buyerPaymentInstrumentIds`, which Square uses for its
   * compliance checks. A free card has no payment instrument, so the caller
   * passes its own reference there too.
   *
   * Square takes the amount from this call, so the caller must have checked it.
   * Do not use this to sell a card: a sale goes through an order and
   * `activateGiftCard`, so Square records it as a gift card sale.
   *
   * @see https://developer.squareup.com/docs/gift-cards/using-gift-cards-api#activate-a-gift-card
   */
  async activateGiftCardWithoutOrder(input: {
    giftCardId: string;
    locationId: string;
    amountCents: number;
    referenceId: string;
    buyerPaymentInstrumentIds: string[];
    idempotencyKey: string;
  }): Promise<{ balanceCents: number }> {
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      throw new Error('Gift card amount must be a positive whole number of cents');
    }
    const response = await this.client.giftCards.activities.create({
      idempotencyKey: input.idempotencyKey,
      giftCardActivity: {
        type: 'ACTIVATE',
        locationId: input.locationId,
        giftCardId: input.giftCardId,
        activateActivityDetails: {
          amountMoney: { amount: BigInt(input.amountCents), currency: 'USD' },
          referenceId: input.referenceId,
          buyerPaymentInstrumentIds: input.buyerPaymentInstrumentIds,
        },
      },
    });
    throwIfGiftCardErrors(response.errors, 'activate gift card');
    return {
      balanceCents: cents(response.giftCardActivity?.giftCardBalanceMoney) ?? 0,
    };
  }

  /**
   * Take money off a card without a sale (#332): Square's `ADJUST_DECREMENT`,
   * with the reason `SUPPORT_ISSUE`. Used to empty a lost card before its
   * balance goes on the card replacing it. Square refuses more than the
   * balance, so a card spent in the meantime fails here rather than going
   * negative.
   */
  async adjustDecrement(input: {
    giftCardId: string;
    locationId: string;
    amountCents: number;
    idempotencyKey: string;
  }): Promise<{ balanceCents: number }> {
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      throw new Error('Gift card amount must be a positive whole number of cents');
    }
    const response = await this.client.giftCards.activities.create({
      idempotencyKey: input.idempotencyKey,
      giftCardActivity: {
        type: 'ADJUST_DECREMENT',
        locationId: input.locationId,
        giftCardId: input.giftCardId,
        adjustDecrementActivityDetails: {
          amountMoney: { amount: BigInt(input.amountCents), currency: 'USD' },
          reason: 'SUPPORT_ISSUE',
        },
      },
    });
    throwIfGiftCardErrors(response.errors, 'take money off the gift card');
    return {
      balanceCents: cents(response.giftCardActivity?.giftCardBalanceMoney) ?? 0,
    };
  }

  /**
   * Turn a card off for good (#332): Square's `DEACTIVATE`. A turned-off card
   * cannot be spent, loaded or turned back on.
   */
  async deactivate(input: {
    giftCardId: string;
    locationId: string;
    idempotencyKey: string;
  }): Promise<void> {
    const response = await this.client.giftCards.activities.create({
      idempotencyKey: input.idempotencyKey,
      giftCardActivity: {
        type: 'DEACTIVATE',
        locationId: input.locationId,
        giftCardId: input.giftCardId,
        deactivateActivityDetails: { reason: 'UNKNOWN_REASON' },
      },
    });
    throwIfGiftCardErrors(response.errors, 'turn the gift card off');
  }

  /**
   * The card behind a Web Payments SDK gift card token, to read its id and
   * balance before charging it. Undefined if the token matches no card.
   */
  async getGiftCardFromNonce(
    nonce: string
  ): Promise<GiftCardSummary | undefined> {
    try {
      const response = await this.client.giftCards.getFromNonce({ nonce });
      return response.giftCard ? toGiftCardSummary(response.giftCard) : undefined;
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw error;
    }
  }

  private async retrieve(id: string): Promise<Square.GiftCard | undefined> {
    try {
      const response = await this.client.giftCards.get({ id });
      return response.giftCard ?? undefined;
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw error;
    }
  }
}

function throwIfGiftCardErrors(
  errors: Square.Error_[] | undefined,
  action: string
): void {
  if (errors && errors.length > 0) {
    const detail = errors.map((e) => e.detail ?? e.code).join('; ');
    throw new Error(`Square could not ${action}: ${detail}`);
  }
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { statusCode, errors } = error as {
    statusCode?: number;
    errors?: Array<{ code?: string }>;
  };
  return (
    statusCode === 404 ||
    (Array.isArray(errors) && errors.some((e) => e.code === 'NOT_FOUND'))
  );
}

/** Square money (bigint cents) to a plain number of cents. */
function cents(money: Square.Money | undefined): number | null {
  if (money?.amount === undefined || money.amount === null) return null;
  return Number(money.amount);
}

const STATES: Record<string, GiftCardState> = {
  ACTIVE: 'active',
  DEACTIVATED: 'deactivated',
  BLOCKED: 'blocked',
  PENDING: 'pending',
};

/** Square card to our summary. Undefined if Square left out the id. */
export function toGiftCardSummary(
  card: Square.GiftCard
): GiftCardSummary | undefined {
  if (!card.id) return undefined;
  const kind: GiftCardKind = card.type === 'PHYSICAL' ? 'plastic' : 'egift';
  return {
    id: card.id,
    last4: (card.gan ?? '').slice(-4),
    kind,
    state: STATES[card.state ?? ''] ?? 'pending',
    balanceCents: cents(card.balanceMoney) ?? 0,
    createdAt: card.createdAt ?? '',
  };
}

const ACTIVITY_TYPES: ReadonlySet<string> = new Set<GiftCardActivityType>([
  'activate',
  'load',
  'redeem',
  'clear_balance',
  'deactivate',
  'adjust_increment',
  'adjust_decrement',
  'refund',
  'unlinked_activity_refund',
  'import',
  'block',
  'unblock',
  'import_reversal',
  'transfer_balance_from',
  'transfer_balance_to',
]);

/** The amount in whichever details block Square filled for this type. */
function activityAmount(activity: Square.GiftCardActivity): number | null {
  const details = [
    activity.activateActivityDetails,
    activity.loadActivityDetails,
    activity.redeemActivityDetails,
    activity.adjustIncrementActivityDetails,
    activity.adjustDecrementActivityDetails,
    activity.refundActivityDetails,
    activity.unlinkedActivityRefundActivityDetails,
    activity.importActivityDetails,
    activity.importReversalActivityDetails,
    activity.transferBalanceToActivityDetails,
    activity.transferBalanceFromActivityDetails,
  ];
  for (const d of details) {
    const amount = cents(
      (d as { amountMoney?: Square.Money } | undefined)?.amountMoney
    );
    if (amount !== null) return amount;
  }
  return null;
}

/**
 * Square activity to our entry, with the amount signed by direction (Square
 * reports every amount as positive). Undefined for an unknown type, so a type
 * Square adds later does not break the page.
 */
export function toGiftCardActivityEntry(
  activity: Square.GiftCardActivity
): GiftCardActivityEntry | undefined {
  const type = String(activity.type ?? '').toLowerCase();
  if (!activity.id || !ACTIVITY_TYPES.has(type)) return undefined;
  const typed = type as GiftCardActivityType;
  const amount = activityAmount(activity);
  const direction = giftCardActivityDirection(typed);
  let amountCents = amount;
  if (amount !== null && direction !== 0) {
    amountCents = direction * Math.abs(amount);
  }
  const orderId =
    activity.activateActivityDetails?.orderId ?? activity.loadActivityDetails?.orderId;
  return {
    id: activity.id,
    giftCardId: activity.giftCardId ?? '',
    type: typed,
    amountCents,
    balanceAfterCents: cents(activity.giftCardBalanceMoney),
    createdAt: activity.createdAt ?? '',
    ...(orderId ? { orderId } : {}),
  };
}

/**
 * Whether Square refused a card because its code is already in use (#332).
 * Matches Square's error code or its wording, since the code a custom GAN
 * clash comes back with is not documented.
 */
export function isGiftCardCodeTakenError(error: unknown): boolean {
  const parts: string[] = [];
  if (error instanceof Error) parts.push(error.message);
  const errors = (error as { errors?: Array<{ code?: string; detail?: string }> } | null)
    ?.errors;
  if (Array.isArray(errors)) {
    for (const e of errors) parts.push(e.code ?? '', e.detail ?? '');
  }
  const text = parts.join(' ');
  return /ALREADY_EXISTS|CONFLICT|already (exists|in use|been used|taken)|duplicate|not unique/i.test(
    text
  );
}
