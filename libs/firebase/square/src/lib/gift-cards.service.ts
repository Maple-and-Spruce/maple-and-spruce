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
}

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

  /** Activities, newest first. Follows every page. */
  async listActivities(
    input: ListGiftCardActivitiesInput = {}
  ): Promise<GiftCardActivityEntry[]> {
    const page = await this.client.giftCards.activities.list({
      giftCardId: input.giftCardId,
      beginTime: input.beginTime?.toISOString(),
      endTime: input.endTime?.toISOString(),
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
   * A new eGift card with no money on it (`PENDING` until activated). Square
   * picks the code. Returns the full code so the caller can email it; the
   * caller must never store it.
   */
  async createDigitalGiftCard(input: {
    locationId: string;
    idempotencyKey: string;
  }): Promise<{ id: string; gan: string; last4: string }> {
    const response = await this.client.giftCards.create({
      idempotencyKey: input.idempotencyKey,
      locationId: input.locationId,
      giftCard: { type: 'DIGITAL' },
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
  return {
    id: activity.id,
    giftCardId: activity.giftCardId ?? '',
    type: typed,
    amountCents,
    balanceAfterCents: cents(activity.giftCardBalanceMoney),
    createdAt: activity.createdAt ?? '',
  };
}
