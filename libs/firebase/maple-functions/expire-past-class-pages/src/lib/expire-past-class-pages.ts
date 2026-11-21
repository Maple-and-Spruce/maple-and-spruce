/**
 * Expire Past Class Pages Scheduled Function
 *
 * Runs daily at 3:30 AM ET and makes sure every past class still has a live
 * Webflow page: a published class whose last session has finished, and whose
 * item is not live, is put back (draft flag cleared, item published).
 *
 * Why the name no longer fits: until 2026-11 this sweep did the opposite and
 * unpublished past class pages, so every past offering became a 404. Past
 * pages are now kept as a record of what the studio has run (search, AI
 * answers, aggregators, prospective instructors); the class page embed shows
 * them as past, with no registration, and points to upcoming classes. The
 * function keeps its name because the library name is the deploy filter:
 * renaming it would deploy a second function and leave this one running, still
 * unpublishing, until someone deleted it by hand.
 *
 * Most past pages never go down in the first place, since nothing unpublishes
 * them any more. This catches the ones the old sweep took down, and any item
 * left as a draft by a failed or partial sync.
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
import { findPastClassesToRestore } from './expire-past-class-pages.logic';

// Define secrets INLINE to avoid cold start delays
const webflowSecretParams = WEBFLOW_SECRET_NAMES.map((name) =>
  defineSecret(name)
);
const webflowStringParams = WEBFLOW_STRING_NAMES.map((name) =>
  defineString(name)
);

/**
 * Keep Webflow detail pages live for classes that have already happened.
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
    // this sweep has nothing to do there, and refusing to run keeps a dev
    // deploy from ever touching a production class page.
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

    const toRestore = findPastClassesToRestore(
      classes,
      liveItemIdsByFirebaseId,
      now
    );

    if (toRestore.length === 0) {
      console.log('No past class pages to restore.', {
        classesChecked: classes.length,
        livePages: liveItemIdsByFirebaseId.size,
      });
      return;
    }

    await webflow.classService.restoreItems(
      toRestore.map((entry) => entry.webflowItemId)
    );

    console.log(`Restored ${toRestore.length} past class page(s).`, {
      classesChecked: classes.length,
      livePages: liveItemIdsByFirebaseId.size,
      restored: toRestore.map((entry) => ({
        classId: entry.classId,
        name: entry.name,
      })),
    });
  }
);
