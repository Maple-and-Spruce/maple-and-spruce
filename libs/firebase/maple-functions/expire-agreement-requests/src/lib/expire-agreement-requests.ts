/**
 * Expire Agreement Requests Scheduled Function
 *
 * Runs daily at 3:00 AM ET to mark pending agreement requests
 * that have passed their expiresAt date as 'expired'.
 *
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import admin from 'firebase-admin';

export const expireAgreementRequests = onSchedule(
  {
    schedule: '0 3 * * *', // 3:00 AM every day
    timeZone: 'America/New_York',
    region: 'us-east4',
  },
  async () => {
    if (admin.apps.length === 0) {
      admin.initializeApp();
    }

    const db = getFirestore();
    const now = new Date();

    const snapshot = await db
      .collection('agreementRequests')
      .where('status', '==', 'pending')
      .where('expiresAt', '<', now)
      .get();

    if (snapshot.empty) {
      console.log('No expired agreement requests found.');
      return;
    }

    const batch = db.batch();
    for (const doc of snapshot.docs) {
      batch.update(doc.ref, {
        status: 'expired',
        updatedAt: now,
      });
    }

    await batch.commit();
    console.log(`Marked ${snapshot.size} agreement request(s) as expired.`);
  }
);
