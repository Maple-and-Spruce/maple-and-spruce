/**
 * Gift cards (#295).
 *
 * Square owns every gift card: its balance, its code and its history. We never
 * store a card's balance or full code in Firestore. These types describe what
 * the admin reads back from Square, and the helpers turn Square's activity
 * types into plain language for Katie.
 *
 * Dates are ISO strings, as Square returns them, so they survive the callable
 * wire without conversion.
 */

/** How the card was issued. */
export type GiftCardKind = 'egift' | 'plastic';

/** Square's card states. A `pending` card was created but never loaded. */
export type GiftCardState = 'active' | 'deactivated' | 'blocked' | 'pending';

export interface GiftCardSummary {
  /** Square gift card id. */
  id: string;
  /** Last 4 digits of the card code. Safe to show; the full code is not. */
  last4: string;
  kind: GiftCardKind;
  state: GiftCardState;
  /** Current balance in cents. */
  balanceCents: number;
  /** When Square created the card (ISO 8601). */
  createdAt: string;
}

/** Square's activity types, lower-cased. */
export type GiftCardActivityType =
  | 'activate'
  | 'load'
  | 'redeem'
  | 'clear_balance'
  | 'deactivate'
  | 'adjust_increment'
  | 'adjust_decrement'
  | 'refund'
  | 'unlinked_activity_refund'
  | 'import'
  | 'block'
  | 'unblock'
  | 'import_reversal'
  | 'transfer_balance_from'
  | 'transfer_balance_to';

export interface GiftCardActivityEntry {
  id: string;
  giftCardId: string;
  type: GiftCardActivityType;
  /**
   * How much the balance moved, in cents: positive when money went on the
   * card, negative when it came off. Null for activities that move no money
   * (block, deactivate) or whose amount Square does not report.
   */
  amountCents: number | null;
  /** The card's balance right after this activity, in cents. */
  balanceAfterCents: number | null;
  /** When it happened (ISO 8601). */
  createdAt: string;
}

/** The numbers at the top of the admin Gift Cards page. */
export interface GiftCardTotals {
  /**
   * Sum of every active card's balance: money customers have paid that has
   * not been spent yet. The studio owes it to them in goods or classes.
   */
  outstandingCents: number;
  /** Active cards with money left on them. */
  cardsWithBalance: number;
  /** Money put on cards (sold or reloaded) since the 1st of this month. */
  loadedThisMonthCents: number;
  /** Money spent from cards since the 1st of this month. */
  spentThisMonthCents: number;
}

const ADDS_MONEY: ReadonlySet<GiftCardActivityType> = new Set([
  'activate',
  'load',
  'adjust_increment',
  'refund',
  'unlinked_activity_refund',
  'import',
  'transfer_balance_to',
]);

const REMOVES_MONEY: ReadonlySet<GiftCardActivityType> = new Set([
  'redeem',
  'clear_balance',
  'adjust_decrement',
  'import_reversal',
  'transfer_balance_from',
]);

/**
 * +1 when the activity puts money on the card, -1 when it takes money off,
 * 0 when it moves none.
 */
export function giftCardActivityDirection(
  type: GiftCardActivityType
): 1 | -1 | 0 {
  if (ADDS_MONEY.has(type)) return 1;
  if (REMOVES_MONEY.has(type)) return -1;
  return 0;
}

const ACTIVITY_LABELS: Record<GiftCardActivityType, string> = {
  activate: 'Sold',
  load: 'Money added',
  redeem: 'Spent',
  clear_balance: 'Balance cleared',
  deactivate: 'Turned off',
  adjust_increment: 'Adjusted up',
  adjust_decrement: 'Adjusted down',
  refund: 'Refunded to card',
  unlinked_activity_refund: 'Refunded to card',
  import: 'Imported',
  block: 'Blocked',
  unblock: 'Unblocked',
  import_reversal: 'Import reversed',
  transfer_balance_from: 'Moved to another card',
  transfer_balance_to: 'Moved from another card',
};

/** What an activity means, in the words Katie would use. */
export function giftCardActivityLabel(type: GiftCardActivityType): string {
  return ACTIVITY_LABELS[type];
}

const STATE_LABELS: Record<GiftCardState, string> = {
  active: 'Active',
  deactivated: 'Turned off',
  blocked: 'Blocked',
  pending: 'Not sold yet',
};

export function giftCardStateLabel(state: GiftCardState): string {
  return STATE_LABELS[state];
}

export function giftCardKindLabel(kind: GiftCardKind): string {
  return kind === 'egift' ? 'eGift card' : 'Plastic card';
}

/**
 * The instant the current month began in `timeZone`, e.g. midnight on the 1st
 * in Morgantown. Used as the start of "this month" for the totals, so a sale
 * at 9pm on the 31st does not count toward the next month.
 */
export function startOfMonthInTimeZone(
  now: Date,
  timeZone = 'America/New_York'
): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);

  // Midnight on the 1st as if it were UTC, then shift by the zone's offset at
  // that moment. The offset is measured at the guess itself, which is right
  // for any zone whose DST change is not at midnight on the 1st.
  const guess = Date.UTC(year, month - 1, 1, 0, 0, 0);
  return new Date(guess - timeZoneOffsetMs(new Date(guess), timeZone));
}

/** How far `timeZone` is ahead of UTC at `at`, in ms (negative for the US). */
function timeZoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second')
  );
  return asUtc - at.getTime();
}

/**
 * The page totals from every card and this month's activities.
 *
 * Only active cards count toward the outstanding balance: a blocked or turned
 * off card cannot be spent, and a pending one was never paid for.
 */
export function summarizeGiftCards(
  cards: readonly GiftCardSummary[],
  activitiesThisMonth: readonly GiftCardActivityEntry[]
): GiftCardTotals {
  let outstandingCents = 0;
  let cardsWithBalance = 0;
  for (const card of cards) {
    if (card.state !== 'active') continue;
    outstandingCents += card.balanceCents;
    if (card.balanceCents > 0) cardsWithBalance += 1;
  }

  let loadedThisMonthCents = 0;
  let spentThisMonthCents = 0;
  for (const activity of activitiesThisMonth) {
    const amount = Math.abs(activity.amountCents ?? 0);
    if (activity.type === 'activate' || activity.type === 'load') {
      loadedThisMonthCents += amount;
    } else if (activity.type === 'redeem') {
      spentThisMonthCents += amount;
    } else if (
      activity.type === 'refund' ||
      activity.type === 'unlinked_activity_refund'
    ) {
      // A refund puts a spend back on the card, so it undoes spending.
      spentThisMonthCents -= amount;
    }
  }

  return {
    outstandingCents,
    cardsWithBalance,
    loadedThisMonthCents,
    spentThisMonthCents: Math.max(0, spentThisMonthCents),
  };
}

// ---------------------------------------------------------------------------
// Gift cards bought on our own buy page (#300) and class certificates (#301)
// ---------------------------------------------------------------------------

/** What the buyer chose: a dollar amount, or one class. */
export type GiftCardPurchaseKind = 'amount' | 'class';

/** Who the card's email goes to. */
export type GiftCardDeliverTo = 'recipient' | 'buyer';

/**
 * A gift card bought through our own buy page. Square still owns the card and
 * its balance; this records what Square cannot: who it was for, the message,
 * and, for a class certificate, which class type it covers.
 *
 * Stored at `giftCardPurchases/{giftCardId}` (one purchase per card).
 */
export interface GiftCardPurchase {
  /** Square gift card id; also the document id. */
  giftCardId: string;
  /** Last 4 digits of the card code. The full code is never stored. */
  last4: string;
  kind: GiftCardPurchaseKind;
  /** What was paid and loaded onto the card, in cents. */
  valueCents: number;
  /** For a class certificate: the class it was bought from. */
  classId?: string;
  /** For a class certificate: the class type it covers. */
  classCategoryId?: string;
  /** For a class certificate: the class's name at purchase, for emails. */
  className?: string;
  buyerName: string;
  buyerEmail: string;
  recipientName?: string;
  recipientEmail?: string;
  message?: string;
  deliverTo: GiftCardDeliverTo;
  squareOrderId: string;
  squarePaymentId: string;
  createdAt: Date;
}

/** The studio covers up to this share of a class certificate's value. */
export const CLASS_CERTIFICATE_CUSHION_RATE = 0.1;

/**
 * How much the studio covers when a class certificate pays for a class.
 *
 * A class certificate is a normal Square gift card that was bought "for a
 * class". When it pays for a class of the same type (category) and the class
 * costs more than what is on the card, the studio covers the difference up to
 * 10% of the certificate's value. Beyond that the customer pays the rest. A
 * cheaper class leaves money on the card, which spends like any gift card.
 *
 * Zero for a dollar gift card, a class of another type, or a class the card
 * already covers.
 */
export function classCertificateCushionCents(input: {
  purchase: Pick<GiftCardPurchase, 'kind' | 'valueCents' | 'classCategoryId'> | undefined;
  /** Category of the class being booked. */
  classCategoryId: string | undefined;
  /** What the class costs after any discount code, in cents. */
  classPriceCents: number;
  /** What is on the card right now, in cents. */
  balanceCents: number;
}): number {
  const { purchase, classCategoryId, classPriceCents, balanceCents } = input;
  if (!purchase || purchase.kind !== 'class') return 0;
  if (!purchase.classCategoryId || purchase.classCategoryId !== classCategoryId) {
    return 0;
  }
  const shortfall = Math.max(0, classPriceCents - Math.max(0, balanceCents));
  const cap = Math.floor(purchase.valueCents * CLASS_CERTIFICATE_CUSHION_RATE);
  return Math.min(shortfall, cap);
}
