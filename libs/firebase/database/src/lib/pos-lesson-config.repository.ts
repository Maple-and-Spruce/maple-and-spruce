/**
 * POS Lesson Config Repository
 *
 * Single config doc (`appConfig/posLessons`) holding the Square catalog
 * object (variation) ids that count as music lessons at the POS. Read by
 * `processPosSale` to route lesson line items to attribution (#628); managed
 * from the admin app (PR 2).
 */
import { db, toDate } from './utilities/database.config';
import type { PosLessonConfig } from '@maple/ts/domain';

const CONFIG_COLLECTION = 'appConfig';
const CONFIG_DOC = 'posLessons';

function docRef() {
  return db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC);
}

export const PosLessonConfigRepository = {
  async get(): Promise<PosLessonConfig> {
    const doc = await docRef().get();
    if (!doc.exists) {
      return { lessonCatalogObjectIds: [] };
    }
    const data = doc.data()!;
    return {
      lessonCatalogObjectIds: data.lessonCatalogObjectIds ?? [],
      updatedAt: data.updatedAt ? toDate(data.updatedAt) : undefined,
      updatedByUid: data.updatedByUid,
    };
  },

  async getLessonCatalogObjectIds(): Promise<string[]> {
    return (await this.get()).lessonCatalogObjectIds;
  },

  async setLessonCatalogObjectIds(
    lessonCatalogObjectIds: string[],
    updatedByUid?: string
  ): Promise<PosLessonConfig> {
    await docRef().set(
      {
        lessonCatalogObjectIds,
        updatedAt: new Date(),
        updatedByUid: updatedByUid ?? null,
      },
      { merge: true }
    );
    return this.get();
  },
};
