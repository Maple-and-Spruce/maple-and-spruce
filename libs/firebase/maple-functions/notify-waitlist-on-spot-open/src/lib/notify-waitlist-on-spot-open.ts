/**
 * Notify Waitlist on Spot Open Cloud Function
 *
 * Firestore trigger on registrations. When a registration transitions from
 * an active state (pending/confirmed) to an inactive state
 * (cancelled/refunded/no-show), or is deleted entirely, we treat that as
 * "a spot opened" and broadcast-email everyone who joined the waitlist
 * for that class.
 *
 * After the broadcast we clear the waitlist subcollection — per product
 * decision, signup is one-shot. If a customer still wants in after
 * missing the link, they can re-sign up.
 *
 * Deployed to us-east4 via CI/CD pipeline.
 */
import {
  onDocumentWritten,
  type Change,
  type DocumentSnapshot,
} from 'firebase-functions/v2/firestore';
import { defineString } from 'firebase-functions/params';
import {
  ClassRepository,
  ClassWaitlistRepository,
  getDb,
} from '@maple/firebase/database';
import { asPublishable, getFirstSession } from '@maple/ts/domain';
import type { RegistrationStatus } from '@maple/ts/domain';

/**
 * Inlined to avoid pulling in the webflow library (and its API SDK) into
 * the maple-core codebase. Mirrors `generateClassSlug` in
 * `@maple/firebase/webflow` — keep them in sync if the slug rules change.
 */
function generateClassSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const allowedOriginsParam = defineString('ALLOWED_ORIGINS');

const ACTIVE_STATUSES: ReadonlySet<RegistrationStatus> = new Set([
  'pending',
  'confirmed',
]);

/**
 * Returns true if this write event represents a registration going from
 * active → inactive (a "spot opened" event).
 *
 * - Delete of an active registration → true
 * - Update from active status to inactive → true
 * - Create of any kind → false (a spot is being taken, not opened)
 * - Update where neither side was active → false
 * - Update where both sides are active (e.g. pending → confirmed) → false
 */
export function isSpotOpeningChange(
  before: DocumentSnapshot | undefined,
  after: DocumentSnapshot | undefined
): boolean {
  const beforeData = before?.exists ? before.data() : undefined;
  const afterData = after?.exists ? after.data() : undefined;

  const wasActive =
    beforeData !== undefined &&
    ACTIVE_STATUSES.has(beforeData['status'] as RegistrationStatus);

  const isActive =
    afterData !== undefined &&
    ACTIVE_STATUSES.has(afterData['status'] as RegistrationStatus);

  return wasActive && !isActive;
}

/**
 * Pull a https origin out of ALLOWED_ORIGINS for building public class URLs.
 * Mirrors the helper used by send-agreement-request — kept inline rather
 * than shared so each function stays self-contained.
 */
function getAppUrl(allowedOrigins: string): string {
  const origins = allowedOrigins.split(',').map((o) => o.trim());
  const httpsOrigin = origins.find((o) => o.startsWith('https://'));
  return httpsOrigin ?? origins[0] ?? 'http://localhost:3000';
}

function formatSessionDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  });
}

export const notifyWaitlistOnSpotOpen = onDocumentWritten(
  {
    document: 'registrations/{registrationId}',
    region: 'us-east4',
  },
  async (event) => {
    const change: Change<DocumentSnapshot> = event.data!;

    if (!isSpotOpeningChange(change.before, change.after)) {
      return;
    }

    const beforeData = change.before?.exists ? change.before.data() : undefined;
    const classId = beforeData?.['classId'] as string | undefined;
    if (!classId) {
      console.log('Spot-open event missing classId, skipping waitlist notify');
      return;
    }

    const [classEntity, waitlistEntries] = await Promise.all([
      ClassRepository.findById(classId),
      ClassWaitlistRepository.findByClassId(classId),
    ]);

    if (waitlistEntries.length === 0) return;
    if (!classEntity || classEntity.status !== 'published') {
      // Class is gone or no longer public — clear the waitlist so the data
      // doesn't linger forever, but don't email out a dead link.
      await ClassWaitlistRepository.clearByClassId(classId);
      return;
    }

    const publishable = asPublishable(classEntity);
    if (!publishable) {
      // Published class with no sessions can happen briefly for drafts that
      // were toggled to published before dates were set. Clear the waitlist
      // rather than emailing a date-less link.
      console.warn('Published class has no sessions, clearing waitlist', {
        classId,
      });
      await ClassWaitlistRepository.clearByClassId(classId);
      return;
    }

    const appUrl = getAppUrl(allowedOriginsParam.value());
    const slug = generateClassSlug(publishable.name);
    const classUrl = `${appUrl}/classes/${slug}`;
    const firstSession = getFirstSession(publishable);
    const classDate = formatSessionDate(firstSession.dateTime);

    const db = getDb();
    const batch = db.batch();

    for (const entry of waitlistEntries) {
      const mailRef = db.collection('mail').doc();
      batch.set(mailRef, {
        to: entry.email,
        template: {
          name: 'class-spot-available',
          data: {
            className: publishable.name,
            classDate,
            classUrl,
          },
        },
      });
    }

    await batch.commit();

    console.log('Notified waitlist of spot opening', {
      classId,
      className: publishable.name,
      notified: waitlistEntries.length,
    });

    // Clear the waitlist so the next cancellation doesn't re-notify the
    // same people. They can re-sign up if they still want in.
    await ClassWaitlistRepository.clearByClassId(classId);
  }
);
