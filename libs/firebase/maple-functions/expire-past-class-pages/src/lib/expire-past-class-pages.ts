/**
 * Expire Past Class Pages Scheduled Function
 *
 * Runs daily at 3:30 AM ET and unpublishes the Webflow CMS item for any class
 * whose last session has already finished.
 *
 * Why this exists: every class offering syncs to its own Webflow CMS item, and
 * each non-draft item publishes a `/classes/{slug}` detail page. Nothing ever
 * took those pages back down, so past classes accumulated in the live site and
 * the auto-generated sitemap — 19 of 28 live class pages were already in the
 * past when this was written. That is thin, near-duplicate content for Google
 * and a dead end for anyone who lands on one.
 *
 * Unpublishing (not deleting) is deliberate: Webflow's live-delete endpoint
 * sets `isDraft = true` and keeps the CMS item, so the class retains its
 * `webflowItemId` and slug. A class rescheduled into the future republishes on
 * its next sync with the same URL.
 *
 * The selection logic lives in `./expire-past-class-pages.logic` — barrel-free
 * so its spec doesn't drag the repository layer into the coverage report.
 *
 * Deployed to us-east4 via CI/CD pipeline (maple-sync codebase).
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import {
  Webflow,
  WEBFLOW_SECRET_NAMES,
  WEBFLOW_STRING_NAMES,
} from '@maple/firebase/webflow';
import { ClassRepository } from '@maple/firebase/database';
import { FirebaseProject } from '@maple/firebase/functions';
import { findExpiredLiveClasses } from './expire-past-class-pages.logic';

// Define secrets INLINE to avoid cold start delays
const webflowSecretParams = WEBFLOW_SECRET_NAMES.map((name) =>
  defineSecret(name)
);
const webflowStringParams = WEBFLOW_STRING_NAMES.map((name) =>
  defineString(name)
);

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
