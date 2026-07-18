/**
 * POS Lesson Attribution domain types
 *
 * When a music lesson is rung up on the Square POS (a configured lesson
 * catalog item, e.g. "Guitar Lesson"), `processPosSale` can't tell which
 * student it was — lessons, unlike classes, are not sold as a per-student
 * catalog item. This record captures that in-person lesson sale so it never
 * silently disappears (the leak #628 closes):
 *
 *  - Auto-attributed when the Square customer's email maps to exactly one
 *    known student (status `attributed`, `attributedBy: 'auto'`).
 *  - Otherwise recorded `pending` for a human to resolve from the review
 *    queue (PR 2), picking the student.
 *
 * On attribution the matching open invoice is settled (`square-pos`), or a
 * paid invoice is created — so lesson payments and teacher payouts stay
 * consistent regardless of how the money came in. See epic #626.
 */

export type PosLessonAttributionStatus = 'pending' | 'attributed' | 'dismissed';

export const POS_LESSON_ATTRIBUTION_STATUSES: PosLessonAttributionStatus[] = [
  'pending',
  'attributed',
  'dismissed',
];

export interface PosLessonAttribution {
  id: string;
  /** Square payment id of the POS sale. */
  squarePaymentId: string;
  /** Square order id the line item belongs to. */
  squareOrderId: string;
  /** Square catalog object (variation) id of the lesson line item. */
  catalogObjectId: string;
  /** Line item name as it appeared on the Square order (e.g. "Guitar Lesson"). */
  itemName: string;
  quantity: number;
  /** Pre-tax subtotal Square recorded for the line, in cents — used to match
   *  an open invoice (invoice totals are pre-tax). */
  subtotalCents: number;
  /** Total the customer actually paid for the line (incl. tax), in cents —
   *  shown in the queue for reference. */
  amountPaidCents: number;
  /** When the POS sale happened (Square payment createdAt). */
  occurredAt: Date;
  squareReceiptUrl?: string;
  squareCustomerId?: string;
  customerEmail?: string;
  customerName?: string;

  status: PosLessonAttributionStatus;
  /** Set once attributed (auto or manual). */
  studentId?: string;
  /** Invoice settled or created on attribution. */
  invoiceId?: string;
  /** `'auto'` when matched by customer email, else the resolver's uid. */
  attributedBy?: string;
  attributedAt?: Date;
  notes?: string;

  createdAt: Date;
  updatedAt: Date;
}

/** Fields the POS processor supplies when first capturing a sale. */
export type CreatePosLessonAttributionInput = Pick<
  PosLessonAttribution,
  | 'squarePaymentId'
  | 'squareOrderId'
  | 'catalogObjectId'
  | 'itemName'
  | 'quantity'
  | 'subtotalCents'
  | 'amountPaidCents'
  | 'occurredAt'
  | 'squareReceiptUrl'
  | 'squareCustomerId'
  | 'customerEmail'
  | 'customerName'
>;

export interface PosLessonAttributionSummary {
  pending: number;
  attributed: number;
  dismissed: number;
}
