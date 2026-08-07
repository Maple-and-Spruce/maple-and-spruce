/**
 * Expire Past Class Pages Scheduled Function
 *
 * Runs daily at 3:30 AM ET and unpublishes the Webflow CMS item for any class
 * whose last session has already finished.
 *
 * Why this exists: every class offering syncs to its own Webflow CMS item, and
 * each non-draft item publishes a `/classes/{slug}` detail page. Nothing ever
 * took those pages back down, so past classes accumulated in the live site and
 * the auto-generated sitemap — 20 of 28 live class pages were already in the
 * past when this was written. That is thin, near-duplicate content for Google
 * and a dead end for anyone who lands on one.
 *
 * Unpublishing (not deleting) is deliberate: Webflow's live-delete endpoint
 * sets `isDraft = true` and keeps the CMS item, so the class retains its
 * `webflowItemId` and slug. A class rescheduled into the future republishes on
 * its next sync with the same URL.
 *
 * Deployed to us-east4 via CI/CD pipeline (maple-sync codebase).
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import type { Class } from '@maple/ts/domain';
import { getSessionEndTime, getSortedSessions } from '@maple/ts/domain';
import {
  Webflow,
  WEBFLOW_SECRET_NAMES,
  WEBFLOW_STRING_NAMES,
} from '@maple/firebase/webflow';
import { ClassRepository } from '@maple/firebase/database';
import { FirebaseProject } from '@maple/firebase/functions';

// Define secrets INLINE to avoid cold start delays
const webflowSecretParams = WEBFLOW_SECRET_NAMES.map((name) =>
  defineSecret(name)
);
const webflowStringParams = WEBFLOW_STRING_NAMES.map((name) =>
  defineString(name)
);

/**
 * A class is expired once its LAST session has finished — a multi-week Studio
 * Series stays live through its final meeting, not just its first.
 *
 * Classes with no sessions are never expired here; they are drafts that the
 * regular sync already keeps out of Webflow.
 */
export function isClassPast(classEntity: Class, now: Date): boolean {
  const sessions = getSortedSessions(classEntity);
  if (sessions.length === 0) return false;

  const lastSession = sessions[sessions.length - 1];
  return getSessionEndTime(lastSession, classEntity.durationMinutes) < now;
}

/**
 * Intersect the classes Firestore knows are in the past with the items Webflow
 * reports as actually live, and return the Webflow item IDs to unpublish.
 *
 * Driving the "is it live?" half off Webflow rather than a Firestore flag makes
 * the sweep idempotent for free: once an item is unpublished it stops appearing
 * in `listItemsLive`, so the next run skips it with no bookkeeping field to
 * keep in sync.
 *
 * Exported for unit testing.
 */
export function findExpiredLiveClasses(
  classes: Class[],
  liveItemIdsByFirebaseId: Map<string, string>,
  now: Date
): { classId: string; name: string; webflowItemId: string }[] {
  const expired: { classId: string; name: string; webflowItemId: string }[] =
    [];

  for (const classEntity of classes) {
    if (!isClassPast(classEntity, now)) continue;

    const webflowItemId = liveItemIdsByFirebaseId.get(classEntity.id);
    if (!webflowItemId) continue;

    expired.push({
      classId: classEntity.id,
      name: classEntity.name,
      webflowItemId,
    });
  }

  return expired;
}

/**
 * Unpublish Webflow detail pages for classes that have already happened.
 */
export const expirePastClassPages = onSchedule(
  {
    schedule: '30 3 * * *', // 3:30 AM every day, after expireAgreementRequests
    timeZone: 'America/New_York',
    region: 'us-east4',
    secrets: webflowSecretParams,
  },
  async () => {
    // Dev and prod share one Webflow site (WEBFLOW_SITE_ID is identical in
    // .env.dev and .env.prod). Dev classes are already synced as drafts, so
    // this sweep has nothing to do there — and refusing to run keeps a dev
    // deploy from ever unpublishing a live production class page.
    if (FirebaseProject.isDev) {
      console.log('Dev environment: skipping past-class page sweep.');
      return;
    }

    const secrets = Object.fromEntries(
      webflowSecretParams.map((s) => [s.name, s.value()])
    ) as Record<(typeof WEBFLOW_SECRET_NAMES)[number], string>;

    const strings = Object.fromEntries(
      webflowStringParams.map((s) => [s.name, s.value()])
    ) as Record<(typeof WEBFLOW_STRING_NAMES)[number], string>;

    const webflow = new Webflow(secrets, strings);
    const now = new Date();

    const [classes, liveItemIdsByFirebaseId] = await Promise.all([
      ClassRepository.findAll(),
      webflow.classService.listLiveItemIdsByFirebaseId(),
    ]);

    const expired = findExpiredLiveClasses(
      classes,
      liveItemIdsByFirebaseId,
      now
    );

    if (expired.length === 0) {
      console.log('No past class pages to unpublish.', {
        classesChecked: classes.length,
        livePages: liveItemIdsByFirebaseId.size,
      });
      return;
    }

    await webflow.classService.unpublishItems(
      expired.map((entry) => entry.webflowItemId)
    );

    console.log(`Unpublished ${expired.length} past class page(s).`, {
      classesChecked: classes.length,
      livePages: liveItemIdsByFirebaseId.size,
      unpublished: expired.map((entry) => ({
        classId: entry.classId,
        name: entry.name,
      })),
    });
  }
);
