/**
 * Business Payment Config Repository (#631)
 *
 * Single config doc (`appConfig/businessPayment`) holding the studio's Venmo
 * handle. Read by the teacher My Day page (to render the pay-by-Venmo QR);
 * managed from the admin Settings page.
 */
import { db, toDate } from './utilities/database.config';
import type { BusinessPaymentConfig } from '@maple/ts/domain';

const CONFIG_COLLECTION = 'appConfig';
const CONFIG_DOC = 'businessPayment';

function docRef() {
  return db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC);
}

export const BusinessPaymentConfigRepository = {
  async get(): Promise<BusinessPaymentConfig> {
    const doc = await docRef().get();
    if (!doc.exists) {
      return {};
    }
    const data = doc.data()!;
    return {
      venmoHandle: data.venmoHandle,
      updatedAt: data.updatedAt ? toDate(data.updatedAt) : undefined,
      updatedByUid: data.updatedByUid,
    };
  },

  async setVenmoHandle(
    venmoHandle: string | undefined,
    updatedByUid?: string
  ): Promise<BusinessPaymentConfig> {
    await docRef().set(
      {
        venmoHandle: venmoHandle ?? null,
        updatedAt: new Date(),
        updatedByUid: updatedByUid ?? null,
      },
      { merge: true }
    );
    return this.get();
  },
};
