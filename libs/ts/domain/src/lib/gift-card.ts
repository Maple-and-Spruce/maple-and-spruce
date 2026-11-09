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
  /**
   * For an `activate` or `load`: the Square order that sold it, when it was
   * sold through one (the register, or our own buy page). Missing for a card
   * loaded with no sale, like a free card (#310) or a replacement (#332).
   */
  orderId?: string;
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
  /**
   * Money put on cards (sold or reloaded) since the 1st of this month. Free
   * cards and replacements for lost cards are left out: neither is a sale.
   * A printed certificate counts once it is sold at the register (#332).
   */
  loadedThisMonthCents: number;
  /** Money spent from cards since the 1st of this month. */
  spentThisMonthCents: number;
  /** Money put on cards the studio gave free since the 1st (#314). */
  givenFreeThisMonthCents: number;
  /**
   * Printed certificates with no money on them yet (#332): made when they
   * were printed, loaded only when sold at the register. A count, since they
   * hold nothing.
   */
  printedNotSoldCount: number;
}

/**
 * What the totals need to know about a card from our own records: how it came
 * about and what was loaded on it. Cards with no record are register or Square
 * sales.
 */
export type GiftCardRecordForTotals = Pick<
  GiftCardPurchase,
  'giftCardId' | 'source' | 'valueCents'
>;

/** A card in the admin list, with what our records say about it (#314). */
export interface GiftCardListItem extends GiftCardSummary {
  /** Set when we have a record of the card. Missing means sold in Square. */
  source?: GiftCardPurchaseSource;
  /** For a printed certificate: the batch it was printed in. */
  batchId?: string;
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
 * Whether a printed certificate is still waiting to be sold (#332).
 *
 * Certificates are printed with no money on them (Square `PENDING`), and the
 * register loads one when it is sold. So a `stock` card is not sold while it
 * is pending. An active one with nothing on it is not sold either if its
 * history shows it was never loaded; without the history (the list) an active
 * card is taken as sold, since Square only activates a card with money.
 */
export function isUnsoldPrintedCertificate(
  card: Pick<GiftCardSummary, 'state' | 'balanceCents'>,
  record: Pick<GiftCardPurchase, 'source'> | undefined,
  history?: readonly Pick<GiftCardActivityEntry, 'type' | 'amountCents'>[]
): boolean {
  if (record?.source !== 'stock') return false;
  if (card.state === 'pending') return true;
  if (card.state !== 'active' || card.balanceCents !== 0 || !history) return false;
  return !history.some(
    (a) => (a.type === 'activate' || a.type === 'load') && (a.amountCents ?? 0) > 0
  );
}

/**
 * Whether money put on a card this month is a sale, a free gift, or neither.
 *
 * - A free card's first load is given, not sold; a top-up on it is a sale.
 * - A replacement's first load is the lost card's balance moved over (#332).
 * - A printed certificate is sold when the register loads it, against an
 *   order. One loaded with no order was printed pre-loaded under #314, before
 *   sales moved to the register, and was never a sale.
 */
function loadKind(
  activity: GiftCardActivityEntry,
  source: GiftCardPurchaseSource | undefined
): 'sold' | 'free' | 'none' {
  if (activity.type !== 'activate') return 'sold';
  if (source === 'issued') return 'free';
  if (source === 'replacement') return 'none';
  if (source === 'stock' && !activity.orderId) return 'none';
  return 'sold';
}

/**
 * The page totals from every card, this month's activities and our records of
 * cards (#314, #332).
 *
 * Only active cards count toward the outstanding balance: a blocked or turned
 * off card cannot be spent, and a pending one was never paid for. That is how
 * a printed certificate stays out of it until it is sold: it is pending until
 * the register loads it. Those are counted on their own, as a number of
 * certificates.
 */
export function summarizeGiftCards(
  cards: readonly GiftCardSummary[],
  activitiesThisMonth: readonly GiftCardActivityEntry[],
  records: readonly GiftCardRecordForTotals[] = []
): GiftCardTotals {
  const recordById = new Map(records.map((r) => [r.giftCardId, r]));

  let outstandingCents = 0;
  let cardsWithBalance = 0;
  let printedNotSoldCount = 0;
  for (const card of cards) {
    if (isUnsoldPrintedCertificate(card, recordById.get(card.id))) {
      printedNotSoldCount += 1;
      continue;
    }
    if (card.state !== 'active') continue;
    outstandingCents += card.balanceCents;
    if (card.balanceCents > 0) cardsWithBalance += 1;
  }

  let loadedThisMonthCents = 0;
  let spentThisMonthCents = 0;
  let givenFreeThisMonthCents = 0;
  for (const activity of activitiesThisMonth) {
    const amount = Math.abs(activity.amountCents ?? 0);
    if (activity.type === 'activate' || activity.type === 'load') {
      const kind = loadKind(activity, recordById.get(activity.giftCardId)?.source);
      if (kind === 'free') givenFreeThisMonthCents += amount;
      else if (kind === 'sold') loadedThisMonthCents += amount;
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
    givenFreeThisMonthCents,
    printedNotSoldCount,
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
 * How a recorded card came about (#310):
 *
 * - `online`: bought on our own buy page (#300). Records from before #310
 *   have no `source`, and read as `online`.
 * - `register`: sold at the shop's Square register, then marked as a class
 *   certificate by Katie on the admin Gift Cards page.
 * - `issued`: given free by the studio from the admin page. No money changed
 *   hands; the value comes out of the studio's pocket when it is spent.
 * - `stock`: a printed certificate (#314), made in a batch from the admin page
 *   and kept in the shop. Since #332 it is printed with no money on it, and
 *   the register loads it when it is sold (Check Balance, then load).
 * - `replacement`: a new card made from the admin page to replace a lost one
 *   (#332). The lost card's balance was moved onto it; `replacesGiftCardId`
 *   names the lost card.
 */
export type GiftCardPurchaseSource =
  | 'online'
  | 'register'
  | 'issued'
  | 'stock'
  | 'replacement';

/**
 * What we know about a gift card that Square cannot hold. Square still owns
 * the card and its balance; this records who it was for, the message, for a
 * class certificate which class type it covers, and how it came about.
 *
 * Stored at `giftCardPurchases/{giftCardId}` (one record per card). The buyer,
 * delivery and Square order fields are only there for a card bought online
 * (see `OnlineGiftCardPurchase`).
 */
export interface GiftCardPurchase {
  /** Square gift card id; also the document id. */
  giftCardId: string;
  /** Last 4 digits of the card code. The full code is never stored. */
  last4: string;
  kind: GiftCardPurchaseKind;
  /**
   * What the card was worth when it was made, in cents: what was paid online,
   * what was loaded at the register, what the studio gave, what a printed
   * certificate says on it, or the balance moved onto a replacement.
   */
  valueCents: number;
  /** How the card came about. Missing means `online`. */
  source?: GiftCardPurchaseSource;
  /** For a class certificate bought online: the class it was bought from. */
  classId?: string;
  /** For a class certificate: the class type it covers. */
  classCategoryId?: string;
  /**
   * For a class certificate: the class's name at purchase (online), or the
   * class type's name (register, issued), for emails and the admin.
   */
  className?: string;
  /** Online only: who paid. */
  buyerName?: string;
  /** Online only: the buyer's email. */
  buyerEmail?: string;
  recipientName?: string;
  recipientEmail?: string;
  /** Register or issued: who the card is from, as written on the certificate. */
  fromName?: string;
  message?: string;
  /** Online only: who the email with the code went to. */
  deliverTo?: GiftCardDeliverTo;
  /** Online only. */
  squareOrderId?: string;
  /** Online only. */
  squarePaymentId?: string;
  /** Issued only: why the studio gave it, in Katie's words. */
  reason?: string;
  /** Register, issued, stock or replacement: the admin who recorded it. */
  recordedByUid?: string;
  /** Stock only: the printing batch (#314). */
  batchId?: string;
  /** Stock only: the card's place in its batch, from 0. */
  batchIndex?: number;
  /** Stock only: the certificate design it was printed with. */
  design?: string;
  /** Replacement only: the lost card whose balance was moved onto this one. */
  replacesGiftCardId?: string;
  createdAt: Date;
}

/** A card bought on our own buy page: every buyer field is there. */
export type OnlineGiftCardPurchase = GiftCardPurchase &
  Required<
    Pick<
      GiftCardPurchase,
      'buyerName' | 'buyerEmail' | 'deliverTo' | 'squareOrderId' | 'squarePaymentId'
    >
  >;

/** How the record came about, reading a missing `source` as `online`. */
export function giftCardPurchaseSource(
  purchase: Pick<GiftCardPurchase, 'source'>
): GiftCardPurchaseSource {
  return purchase.source ?? 'online';
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
