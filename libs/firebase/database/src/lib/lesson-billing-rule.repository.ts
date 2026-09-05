/**
 * Lesson Billing Rule Repository (#798)
 *
 * Named, reusable rules — "Every 4 lessons, charged the day before" — attached
 * to many students, so a change in studio policy is one edit rather than one
 * per student.
 */
import { db, toDate } from './utilities/database.config';
import type {
  CreateLessonBillingRuleInput,
  LessonBillingRule,
  UpdateLessonBillingRuleInput,
} from '@maple/ts/domain';

const COLLECTION = 'lessonBillingRules';

function docToRule(
  doc: FirebaseFirestore.DocumentSnapshot
): LessonBillingRule | undefined {
  if (!doc.exists) return undefined;
  const data = doc.data()!;
  return {
    id: doc.id,
    name: data.name,
    cadence: data.cadence,
    lessonsPerCharge: data.lessonsPerCharge,
    anchor: data.anchor,
    anchorOffsetDays: data.anchorOffsetDays,
    flatAmountCents: data.flatAmountCents,
    isDefault: data.isDefault === true,
    archived: data.archived === true,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = v;
  return out as T;
}

/**
 * Exactly one rule is the default. Clearing the others happens in the same
 * batch as setting the new one, so there is never a moment with two defaults
 * (or none) for a concurrent read to land on.
 */
async function clearOtherDefaults(exceptId: string): Promise<void> {
  const snapshot = await db
    .collection(COLLECTION)
    .where('isDefault', '==', true)
    .get();
  const batch = db.batch();
  let touched = false;
  for (const doc of snapshot.docs) {
    if (doc.id === exceptId) continue;
    batch.update(doc.ref, { isDefault: false, updatedAt: new Date() });
    touched = true;
  }
  if (touched) await batch.commit();
}

export const LessonBillingRuleRepository = {
  async findAll(): Promise<LessonBillingRule[]> {
    const snapshot = await db.collection(COLLECTION).get();
    return snapshot.docs
      .map(docToRule)
      .filter((r): r is LessonBillingRule => r !== undefined)
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
  },

  async findById(id: string): Promise<LessonBillingRule | undefined> {
    return docToRule(await db.collection(COLLECTION).doc(id).get());
  },

  /** The studio default — what a student with no explicit rule is billed on. */
  async findDefault(): Promise<LessonBillingRule | undefined> {
    const snapshot = await db
      .collection(COLLECTION)
      .where('isDefault', '==', true)
      .limit(1)
      .get();
    return snapshot.docs[0] ? docToRule(snapshot.docs[0]) : undefined;
  },

  async create(input: CreateLessonBillingRuleInput): Promise<LessonBillingRule> {
    const now = new Date();
    const payload = stripUndefined({ ...input, createdAt: now, updatedAt: now });
    const ref = await db.collection(COLLECTION).add(payload);
    if (input.isDefault) await clearOtherDefaults(ref.id);
    return { id: ref.id, ...payload } as LessonBillingRule;
  },

  async update(
    input: UpdateLessonBillingRuleInput
  ): Promise<LessonBillingRule | undefined> {
    const { id, ...changes } = input;
    await db
      .collection(COLLECTION)
      .doc(id)
      .update(stripUndefined({ ...changes, updatedAt: new Date() }));
    if (changes.isDefault) await clearOtherDefaults(id);
    return this.findById(id);
  },
};
