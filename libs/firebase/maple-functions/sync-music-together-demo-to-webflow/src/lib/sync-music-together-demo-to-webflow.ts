/**
 * Sync Music Together Demo to Webflow Cloud Function
 *
 * Firestore trigger that syncs Music Together demo-class changes to Webflow
 * CMS. Follows one-way sync pattern: Firebase → Webflow (as per ADR-016).
 *
 * Demos are FREE try-a-class events — no section, no payment, no Square.
 *
 * Triggers on:
 * - Demo created: Creates a new item in Webflow CMS (if visible + future-dated)
 * - Demo updated: Updates the item (or removes it when hidden / past)
 * - Demo deleted: Removes the item from Webflow CMS
 *
 * Enriches the demo with the live confirmed-RSVP count so the public site shows
 * accurate "spots remaining".
 *
 * Dev-leak guard: dev items are created/kept as drafts and never published (the
 * `MtDemoWebflowService` sets `isDraft` from `isDev`), so a full-site publish
 * can never make a dev demo live.
 */
import {
  onDocumentWritten,
  type Change,
  type DocumentSnapshot,
} from 'firebase-functions/v2/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import type { MusicTogetherDemo } from '@maple/ts/domain';
import {
  Webflow,
  WEBFLOW_SECRET_NAMES,
  WEBFLOW_STRING_NAMES,
} from '@maple/firebase/webflow';
import {
  MusicTogetherDemoRepository,
  MusicTogetherDemoRsvpRepository,
} from '@maple/firebase/database';
import { FirebaseProject } from '@maple/firebase/functions';

// Define secrets INLINE to avoid cold start delays
const webflowSecretParams = WEBFLOW_SECRET_NAMES.map((name) =>
  defineSecret(name)
);
const webflowStringParams = WEBFLOW_STRING_NAMES.map((name) =>
  defineString(name)
);

/**
 * Convert a raw Firestore value to a Date.
 */
function toDateLike(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate: unknown }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

/**
 * Extract Music Together demo data from a Firestore snapshot.
 */
function extractDemo(
  snapshot: DocumentSnapshot | undefined
): MusicTogetherDemo | null {
  if (!snapshot || !snapshot.exists) {
    return null;
  }

  const data = snapshot.data();
  if (!data) return null;

  const dateTime = toDateLike(data['dateTime']);
  if (!dateTime) return null;

  return {
    id: snapshot.id,
    ...data,
    dateTime,
    createdAt: toDateLike(data['createdAt']) ?? new Date(),
  } as MusicTogetherDemo;
}

/**
 * Sync Music Together Demo to Webflow CMS
 *
 * Firestore trigger that runs when a demo document is created, updated, or
 * deleted. Visible, future-dated demos are synced to Webflow; hidden, past, or
 * deleted demos are removed.
 */
export const syncMusicTogetherDemoToWebflow = onDocumentWritten(
  {
    document: 'musicTogetherDemos/{demoId}',
    region: 'us-east4',
    secrets: webflowSecretParams,
  },
  async (event) => {
    const change: Change<DocumentSnapshot> = event.data!;
    const beforeDemo = extractDemo(change.before);
    const afterDemo = extractDemo(change.after);

    console.log('Sync MT demo to Webflow triggered:', {
      demoId: event.params.demoId,
      before: beforeDemo
        ? { location: beforeDemo.location, visible: beforeDemo.visible }
        : null,
      after: afterDemo
        ? { location: afterDemo.location, visible: afterDemo.visible }
        : null,
    });

    const secrets = Object.fromEntries(
      webflowSecretParams.map((s) => [s.name, s.value()])
    ) as Record<(typeof WEBFLOW_SECRET_NAMES)[number], string>;

    const strings = Object.fromEntries(
      webflowStringParams.map((s) => [s.name, s.value()])
    ) as Record<(typeof WEBFLOW_STRING_NAMES)[number], string>;

    const webflow = new Webflow(secrets, strings);

    const isDev = FirebaseProject.isDev;
    const shouldPublish = !isDev;

    try {
      // Case 1: Demo deleted
      if (!afterDemo) {
        console.log('MT demo deleted, removing from Webflow');
        const removed = await webflow.demoService.removeDemo(
          event.params.demoId,
          shouldPublish,
          beforeDemo?.webflowItemId
        );
        console.log(
          removed
            ? 'Successfully removed from Webflow'
            : 'MT demo not found in Webflow (already removed?)'
        );
        return;
      }

      // Case 2: Demo is not visible OR past-dated — hidden from the public
      // site. Remove any prior Webflow item (covers "was visible, now hidden",
      // create-as-hidden, and a demo whose date has passed).
      const isPast = afterDemo.dateTime.getTime() < Date.now();
      if (!afterDemo.visible || isPast) {
        console.log(
          `MT demo is ${!afterDemo.visible ? 'hidden' : 'past'}, removing from Webflow`
        );
        const removed = await webflow.demoService.removeDemo(
          afterDemo.id,
          shouldPublish,
          afterDemo.webflowItemId
        );
        console.log(
          removed
            ? 'Successfully removed from Webflow'
            : 'MT demo not found in Webflow'
        );
        return;
      }

      // Case 3: Demo is visible + upcoming — enrich with the live confirmed-RSVP
      // count and sync to Webflow (the derived status is computed in the field
      // mapping).
      const confirmedCount =
        await MusicTogetherDemoRsvpRepository.countByDemoIdAndStatus(
          afterDemo.id,
          'confirmed'
        );

      console.log('Syncing MT demo to Webflow:', {
        location: afterDemo.location,
        visible: afterDemo.visible,
        isDev,
        autoPublish: shouldPublish,
        confirmedCount,
      });

      const result = await webflow.demoService.syncDemo({
        demo: afterDemo,
        publish: shouldPublish,
        isDev,
        confirmedCount,
        existingWebflowItemId: afterDemo.webflowItemId,
      });

      console.log('Webflow sync result:', {
        success: result.success,
        webflowItemId: result.webflowItemId,
        isNew: result.isNew,
        isDev,
        published: shouldPublish,
      });

      // Store the Webflow item ID back in Firestore.
      // Uses bare update (no other fields) to prevent re-triggering sync.
      if (
        result.success &&
        result.webflowItemId &&
        afterDemo.webflowItemId !== result.webflowItemId
      ) {
        await MusicTogetherDemoRepository.updateWebflowItemId(
          afterDemo.id,
          result.webflowItemId
        );
        console.log('Updated Firestore with Webflow item ID');
      }
    } catch (error) {
      console.error('Webflow MT demo sync error:', error);
      // Don't throw — prevent retry loops for Webflow API errors.
    }
  }
);
