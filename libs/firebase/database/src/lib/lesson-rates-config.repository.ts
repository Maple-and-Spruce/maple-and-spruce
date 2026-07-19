/**
 * Lesson Rates Config Repository (#629)
 *
 * Single config doc (`appConfig/lessonRates`) holding the admin-configured
 * default private-pay lesson rates by length. Read by the auto-invoice trigger
 * to price a rendered lesson; managed from the admin Settings page.
 */
import { db, toDate } from './utilities/database.config';
import type { LessonRateByLength, LessonRatesConfig } from '@maple/ts/domain';

const CONFIG_COLLECTION = 'appConfig';
const CONFIG_DOC = 'lessonRates';

function docRef() {
  return db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC);
}

export const LessonRatesConfigRepository = {
  async get(): Promise<LessonRatesConfig> {
    const doc = await docRef().get();
    if (!doc.exists) {
      return { rateByLength: {} };
    }
    const data = doc.data()!;
    return {
      rateByLength: (data.rateByLength ?? {}) as LessonRateByLength,
      updatedAt: data.updatedAt ? toDate(data.updatedAt) : undefined,
      updatedByUid: data.updatedByUid,
    };
  },

  async setRateByLength(
    rateByLength: LessonRateByLength,
    updatedByUid?: string
  ): Promise<LessonRatesConfig> {
    await docRef().set(
      {
        rateByLength,
        updatedAt: new Date(),
        updatedByUid: updatedByUid ?? null,
      },
      { merge: true }
    );
    return this.get();
  },
};
