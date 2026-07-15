/**
 * Sync Music Together Section to Webflow Cloud Function
 *
 * Firestore trigger that syncs Music Together section changes to Webflow CMS.
 * Follows one-way sync pattern: Firebase → Webflow (as per ADR-016).
 *
 * Triggers on:
 * - Section created: Creates a new item in Webflow CMS (if status != draft)
 * - Section updated: Updates the item (or removes it when moved to draft)
 * - Section deleted: Removes the item from Webflow CMS
 *
 * Enriches the section with the live family count so the public site shows
 * accurate "spots remaining".
 */
import {
  onDocumentWritten,
  type Change,
  type DocumentSnapshot,
} from 'firebase-functions/v2/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import type { MusicTogetherSection } from '@maple/ts/domain';
import {
  Webflow,
  WEBFLOW_SECRET_NAMES,
  WEBFLOW_STRING_NAMES,
} from '@maple/firebase/webflow';
import {
  MusicTogetherSectionRepository,
  MusicTogetherRegistrationRepository,
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
 * Parse sessions from a Firestore section document.
 */
function parseSessions(rawSessions: unknown): { dateTime: Date }[] {
  if (!Array.isArray(rawSessions)) return [];
  return rawSessions
    .map((entry) => {
      const dateField =
        entry && typeof entry === 'object' && 'dateTime' in entry
          ? (entry as { dateTime: unknown }).dateTime
          : entry;
      return { dateTime: toDateLike(dateField) };
    })
    .filter((s): s is { dateTime: Date } => s.dateTime !== undefined)
    .sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
}

/**
 * Parse the installment plan from a Firestore section document.
 */
function parseInstallmentPlan(
  raw: unknown
): { amountCents: number; dueAt: Date }[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: { amountCents: number; dueAt: Date }[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as { amountCents?: unknown; dueAt?: unknown };
    const dueAt = toDateLike(e.dueAt);
    if (typeof e.amountCents !== 'number' || !dueAt) continue;
    out.push({ amountCents: e.amountCents, dueAt });
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Extract Music Together section data from a Firestore snapshot.
 */
function extractSection(
  snapshot: DocumentSnapshot | undefined
): MusicTogetherSection | null {
  if (!snapshot || !snapshot.exists) {
    return null;
  }

  const data = snapshot.data();
  if (!data) return null;

  return {
    id: snapshot.id,
    ...data,
    sessions: parseSessions(data['sessions']),
    installmentPlan: parseInstallmentPlan(data['installmentPlan']),
    enrollmentOpensAt: toDateLike(data['enrollmentOpensAt']),
    enrollmentClosesAt: toDateLike(data['enrollmentClosesAt']),
    createdAt: toDateLike(data['createdAt']) ?? new Date(),
    updatedAt: toDateLike(data['updatedAt']) ?? new Date(),
  } as MusicTogetherSection;
}

/**
 * Sync Music Together Section to Webflow CMS
 *
 * Firestore trigger that runs when a section document is created, updated, or
 * deleted. Non-draft sections are synced to Webflow; draft/deleted sections
 * are removed.
 */
export const syncMusicTogetherSectionToWebflow = onDocumentWritten(
  {
    document: 'musicTogetherSections/{sectionId}',
    region: 'us-east4',
    secrets: webflowSecretParams,
  },
  async (event) => {
    const change: Change<DocumentSnapshot> = event.data!;
    const beforeSection = extractSection(change.before);
    const afterSection = extractSection(change.after);

    console.log('Sync MT section to Webflow triggered:', {
      sectionId: event.params.sectionId,
      before: beforeSection
        ? { name: beforeSection.name, visible: beforeSection.visible }
        : null,
      after: afterSection
        ? { name: afterSection.name, visible: afterSection.visible }
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
      // Case 1: Section deleted
      if (!afterSection) {
        console.log('MT section deleted, removing from Webflow');
        const removed = await webflow.sectionService.removeSection(
          event.params.sectionId,
          shouldPublish,
          beforeSection?.webflowItemId
        );
        console.log(
          removed
            ? 'Successfully removed from Webflow'
            : 'MT section not found in Webflow (already removed?)'
        );
        return;
      }

      // Case 2: Section is not visible — hidden from the public site. Remove any
      // prior Webflow item (covers "was visible, now hidden" as well as
      // create-as-hidden).
      if (!afterSection.visible) {
        console.log('MT section is hidden, removing from Webflow');
        const removed = await webflow.sectionService.removeSection(
          afterSection.id,
          shouldPublish,
          afterSection.webflowItemId
        );
        console.log(
          removed
            ? 'Successfully removed from Webflow'
            : 'MT section not found in Webflow'
        );
        return;
      }

      // Case 3: Section is visible — enrich with the live family count and sync
      // to Webflow (the derived status is computed in the field mapping).
      const familyCount =
        await MusicTogetherRegistrationRepository.countBySectionId(
          afterSection.id
        );

      console.log('Syncing MT section to Webflow:', {
        name: afterSection.name,
        visible: afterSection.visible,
        isDev,
        autoPublish: shouldPublish,
        familyCount,
      });

      const result = await webflow.sectionService.syncSection({
        section: afterSection,
        publish: shouldPublish,
        isDev,
        familyCount,
        existingWebflowItemId: afterSection.webflowItemId,
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
        afterSection.webflowItemId !== result.webflowItemId
      ) {
        await MusicTogetherSectionRepository.updateWebflowItemId(
          afterSection.id,
          result.webflowItemId
        );
        console.log('Updated Firestore with Webflow item ID');
      }
    } catch (error) {
      console.error('Webflow MT section sync error:', error);
      // Don't throw — prevent retry loops for Webflow API errors.
    }
  }
);
