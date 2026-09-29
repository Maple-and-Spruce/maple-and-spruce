/**
 * EMA portal products (WV Hope Scholarship).
 *
 * A Hope lesson is billed in the EMA portal against one of the studio's
 * approved products ("Suzuki Violin Lesson - 30 min", "Old-Time Fiddle Lesson -
 * 60 min", …), each with its own EMA product id and price. That product, not a
 * table in code, is what the lesson is worth: the old length-only table priced a
 * 30-minute guitar lesson at $41.25 while EMA pays $30 for it, and teacher
 * payouts inherited the error.
 *
 * Katie keeps this list in step with the portal from the Hope Billing page, and
 * each Hope student is put on the product their award is billed under.
 */
import type { LessonLength, Student } from './student';
import { HOPE_PER_LESSON_RATE_CENTS } from './hope-rates';

export interface HopeProduct {
  id: string;
  /** The id the EMA portal shows for this product (e.g. "103772"). */
  emaProductId: string;
  /** Exactly as it reads in the portal, so the two can be matched by eye. */
  name: string;
  /** EMA's approved price per lesson, in cents. */
  priceCents: number;
  /** Retired products stay for history but are not offered for new students. */
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type SaveHopeProductInput = Omit<
  HopeProduct,
  'id' | 'createdAt' | 'updatedAt'
> & {
  /** Present to edit an existing product, absent to add one. */
  id?: string;
};

/**
 * Where a Hope lesson's price came from. `estimate` means the student is not on
 * a product yet, so the old length table stood in; screens say so rather than
 * presenting a guess as what EMA will pay.
 */
export type HopeRateSource = 'product' | 'estimate';

export interface HopeLessonRate {
  rateCents: number;
  source: HopeRateSource;
  /** The product the rate came from, when it came from one. */
  product?: HopeProduct;
}

/** The legacy tier for a lesson with no registered length. */
function tierForDuration(durationMinutes: number): LessonLength {
  if (durationMinutes >= 60) return '60-min';
  if (durationMinutes >= 45) return '45-min';
  return '30-min-full';
}

/**
 * What one of this student's Hope lessons is worth.
 *
 * The student's EMA product when they have one (active or not: a retired
 * product still describes what past lessons were billed at). Otherwise the old
 * length table, marked as an estimate. One definition, used by the queue, the
 * claim stamp and teacher payouts, which each had their own copy of the
 * length fallback.
 */
export function resolveHopeLessonRate(
  student: Pick<Student, 'hopeProductId' | 'registeredLessonLength'>,
  lesson: { durationMinutes: number },
  productsById: ReadonlyMap<string, HopeProduct>
): HopeLessonRate {
  const product = student.hopeProductId
    ? productsById.get(student.hopeProductId)
    : undefined;
  if (product) {
    return { rateCents: product.priceCents, source: 'product', product };
  }
  const tier =
    student.registeredLessonLength ?? tierForDuration(lesson.durationMinutes);
  return { rateCents: HOPE_PER_LESSON_RATE_CENTS[tier], source: 'estimate' };
}

/** "$32.50", for product prices. */
export function formatHopePrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
