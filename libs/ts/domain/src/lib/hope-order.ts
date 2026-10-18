/**
 * EMA orders (WV Hope Scholarship).
 *
 * A Hope family orders lessons from the studio in the EMA portal, a block at a
 * time ("8 lessons of Suzuki Violin"), and the studio then invoices each lesson
 * against that order once it has been taught. So a taught lesson is in one of
 * three places:
 *
 *   needs an order     taught, but no order has room for it yet: it cannot be
 *                      invoiced in the portal until the family orders more
 *   ready to invoice   taught, and an order has room: invoice it in the portal
 *   invoiced           the invoice is done (a claim exists and was not rejected)
 *
 * Katie does not assign lessons to orders by hand. `allocateHopeLessons` fills
 * each order oldest first with the oldest taught lessons, which is what the
 * portal's own drawdown does, and invoicing stamps the order onto the claim so
 * a later order or a corrected count cannot move an invoiced lesson.
 */
import type { HopeSubmission } from './hope-submission';

export interface HopeOrder {
  id: string;
  studentId: string;
  /** The EMA product ordered. */
  productId: string;
  /**
   * Price per lesson when the order was placed, copied from the product so a
   * later price change does not rewrite what this order is worth.
   */
  priceCents: number;
  /** How many lessons the family ordered. */
  lessonCount: number;
  /** The portal's order id, when Katie has it to hand. */
  emaOrderId?: string;
  /** When the family placed the order. Sets drawdown order. */
  orderedOn: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SaveHopeOrderInput {
  /** Present to edit an existing order. */
  id?: string;
  studentId: string;
  productId: string;
  lessonCount: number;
  emaOrderId?: string;
  orderedOn: Date;
  notes?: string;
}

export type HopeLessonState =
  | { kind: 'needs-order' }
  | { kind: 'ready-to-invoice'; orderId: string }
  | { kind: 'invoiced'; orderId?: string };

/** A claim that counts as the invoice being done. Rejected means redo it. */
export function isHopeInvoiced(
  submission: Pick<HopeSubmission, 'status'> | undefined
): boolean {
  return Boolean(submission) && submission?.status !== 'rejected';
}

export interface HopeAllocation {
  states: Map<string, HopeLessonState>;
  /** Lessons each order still has room for, after invoiced and ready ones. */
  remainingByOrder: Map<string, number>;
}

/**
 * Where each of one student's taught lessons stands against their orders.
 *
 * Invoiced lessons keep the order stamped on their claim (claims from before
 * orders existed have none, and use no order's room). The rest are taken
 * oldest first and fitted into orders oldest first; whatever does not fit
 * needs an order.
 */
export function allocateHopeLessons(
  lessons: Array<{
    lessonId: string;
    scheduledAt: Date;
    submission?: Pick<HopeSubmission, 'status' | 'orderId'>;
  }>,
  orders: Array<Pick<HopeOrder, 'id' | 'lessonCount' | 'orderedOn'>>
): HopeAllocation {
  const states = new Map<string, HopeLessonState>();
  const remaining = new Map(orders.map((o) => [o.id, o.lessonCount]));

  for (const lesson of lessons) {
    if (!isHopeInvoiced(lesson.submission)) continue;
    const orderId = lesson.submission?.orderId;
    states.set(lesson.lessonId, { kind: 'invoiced', orderId });
    if (orderId && remaining.has(orderId)) {
      remaining.set(orderId, (remaining.get(orderId) ?? 0) - 1);
    }
  }

  const queue = orders
    .slice()
    .sort((a, b) => a.orderedOn.getTime() - b.orderedOn.getTime());
  const waiting = lessons
    .filter((l) => !states.has(l.lessonId))
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

  for (const lesson of waiting) {
    const order = queue.find((o) => (remaining.get(o.id) ?? 0) > 0);
    if (!order) {
      states.set(lesson.lessonId, { kind: 'needs-order' });
      continue;
    }
    remaining.set(order.id, (remaining.get(order.id) ?? 0) - 1);
    states.set(lesson.lessonId, { kind: 'ready-to-invoice', orderId: order.id });
  }

  // An order can be over-invoiced if its count was lowered after the fact;
  // report that as no room rather than negative room.
  for (const [id, left] of remaining) remaining.set(id, Math.max(0, left));

  return { states, remainingByOrder: remaining };
}
