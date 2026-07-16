/**
 * Sync Music Together Semester to Webflow Cloud Function
 *
 * Firestore trigger that syncs Music Together semester (term) changes to Webflow
 * CMS. Follows one-way sync pattern: Firebase → Webflow (as per ADR-016).
 *
 * Triggers on:
 * - Semester created: Creates a new item in Webflow CMS
 * - Semester updated: Updates the item
 * - Semester deleted: Removes the item from Webflow CMS
 *
 * Unlike sections, semesters have NO 'draft' status — a `planned` term is meant
 * to show publicly (so the site can describe an upcoming term). Every semester
 * is synced regardless of status; only a DELETE removes the Webflow item.
 */
import {
  onDocumentWritten,
  type Change,
  type DocumentSnapshot,
} from 'firebase-functions/v2/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import type {
  MusicTogetherSemester,
  MusicTogetherSemesterBreak,
} from '@maple/ts/domain';
import {
  Webflow,
  WEBFLOW_SECRET_NAMES,
  WEBFLOW_STRING_NAMES,
} from '@maple/firebase/webflow';
import { MusicTogetherSemesterRepository } from '@maple/firebase/database';
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
 * Parse holiday / mid-term breaks from a Firestore semester document.
 */
function parseBreaks(raw: unknown): MusicTogetherSemesterBreak[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: MusicTogetherSemesterBreak[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as {
      label?: unknown;
      startDate?: unknown;
      endDate?: unknown;
    };
    const startDate = toDateLike(e.startDate);
    const endDate = toDateLike(e.endDate);
    if (typeof e.label !== 'string' || !startDate || !endDate) continue;
    out.push({ label: e.label, startDate, endDate });
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Parse an array of raw Firestore dates.
 */
function parseDates(raw: unknown): Date[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out = raw
    .map((d) => toDateLike(d))
    .filter((d): d is Date => d !== undefined);
  return out.length > 0 ? out : undefined;
}

/**
 * Extract Music Together semester data from a Firestore snapshot.
 */
function extractSemester(
  snapshot: DocumentSnapshot | undefined
): MusicTogetherSemester | null {
  if (!snapshot || !snapshot.exists) {
    return null;
  }

  const data = snapshot.data();
  if (!data) return null;

  return {
    id: snapshot.id,
    ...data,
    startDate: toDateLike(data['startDate']),
    endDate: toDateLike(data['endDate']),
    breaks: parseBreaks(data['breaks']),
    weatherMakeupDates: parseDates(data['weatherMakeupDates']),
    enrollmentOpensAt: toDateLike(data['enrollmentOpensAt']),
    createdAt: toDateLike(data['createdAt']) ?? new Date(),
    updatedAt: toDateLike(data['updatedAt']) ?? new Date(),
  } as MusicTogetherSemester;
}

/**
 * Sync Music Together Semester to Webflow CMS
 *
 * Firestore trigger that runs when a semester document is created, updated, or
 * deleted. All semesters are synced (no draft status); deleted semesters are
 * removed.
 */
export const syncMusicTogetherSemesterToWebflow = onDocumentWritten(
  {
    document: 'musicTogetherSemesters/{semesterId}',
    region: 'us-east4',
    secrets: webflowSecretParams,
  },
  async (event) => {
    const change: Change<DocumentSnapshot> = event.data!;
    const beforeSemester = extractSemester(change.before);
    const afterSemester = extractSemester(change.after);

    console.log('Sync MT semester to Webflow triggered:', {
      semesterId: event.params.semesterId,
      before: beforeSemester ? { name: beforeSemester.name } : null,
      after: afterSemester ? { name: afterSemester.name } : null,
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
      // Case 1: Semester deleted — remove from Webflow.
      if (!afterSemester) {
        console.log('MT semester deleted, removing from Webflow');
        const removed = await webflow.semesterService.removeSemester(
          event.params.semesterId,
          shouldPublish,
          beforeSemester?.webflowItemId
        );
        console.log(
          removed
            ? 'Successfully removed from Webflow'
            : 'MT semester not found in Webflow (already removed?)'
        );
        return;
      }

      // Case 2: Semester created/updated — sync to Webflow regardless of
      // status (planned/enrolling/active/completed all show publicly).
      console.log('Syncing MT semester to Webflow:', {
        name: afterSemester.name,
        isDev,
        autoPublish: shouldPublish,
      });

      const result = await webflow.semesterService.syncSemester({
        semester: afterSemester,
        publish: shouldPublish,
        isDev,
        existingWebflowItemId: afterSemester.webflowItemId,
      });

      console.log('Webflow sync result:', {
        success: result.success,
        webflowItemId: result.webflowItemId,
        isNew: result.isNew,
        isDev,
        published: shouldPublish,
      });

      // Store the Webflow item ID back in Firestore.
      // Uses bare update (no updatedAt) to prevent re-triggering sync.
      if (
        result.success &&
        result.webflowItemId &&
        afterSemester.webflowItemId !== result.webflowItemId
      ) {
        await MusicTogetherSemesterRepository.updateWebflowItemId(
          afterSemester.id,
          result.webflowItemId
        );
        console.log('Updated Firestore with Webflow item ID');
      }
    } catch (error) {
      console.error('Webflow MT semester sync error:', error);
      // Don't throw — prevent retry loops for Webflow API errors.
    }
  }
);
