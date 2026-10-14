/**
 * Get Inbox (#235)
 *
 * The admin Home dashboard's Inbox: one studio-wide list of things to do,
 * built server-side in one call so the Home page does not add a cold start
 * per kind. It is a route on the lessons router because the Home page
 * already calls `lessons/getStudioDay`, so both land on the same warm
 * instance, and most of what it reads is lesson data.
 *
 * What gets in, and when it leaves, is decided by `buildInboxItems` in the
 * domain library; this only reads. Needs-attention is shared with the
 * `getNeedsAttention` function (`collectNeedsAttention`), whose students,
 * lessons and charges are reused for failed charges rather than read twice.
 *
 * Dismissed items are filtered here by reading exactly the keys about to be
 * shown, so "Mark done" holds for everyone at the studio.
 */
import {
  AgreementRequestRepository,
  ClassRepository,
  CraftClubMemberRepository,
  InboxDismissalRepository,
  LessonInquiryRepository,
  SyncConflictRepository,
} from '@maple/firebase/database';
import { collectNeedsAttention } from '@maple/firebase/maple-functions/get-needs-attention';
import {
  buildInboxItems,
  withoutDismissed,
  type InboxClass,
} from '@maple/ts/domain';
import type { GetInboxResponse } from '@maple/ts/firebase/api-types';

/** Each student's next non-cancelled lesson at or after `now`. */
function nextLessonByStudent(
  lessons: ReadonlyArray<{ studentId: string; scheduledAt: Date; status: string }>,
  now: Date
): Map<string, Date> {
  const next = new Map<string, Date>();
  for (const lesson of lessons) {
    if (lesson.status === 'cancelled') continue;
    if (lesson.scheduledAt.getTime() < now.getTime()) continue;
    const seen = next.get(lesson.studentId);
    if (!seen || lesson.scheduledAt < seen) {
      next.set(lesson.studentId, lesson.scheduledAt);
    }
  }
  return next;
}

export async function getInbox(): Promise<GetInboxResponse> {
  const now = new Date();

  const [scan, inquiries, craftClubMembers, pendingAgreements, syncConflicts] =
    await Promise.all([
      // The whole studio: the inbox is admin-only.
      collectNeedsAttention(undefined, now),
      LessonInquiryRepository.findAll({ status: 'new' }),
      CraftClubMemberRepository.findAll(),
      AgreementRequestRepository.findAll({ status: 'pending' }),
      SyncConflictRepository.findPending(),
    ]);

  // Only the classes a pending request names; the rest are not needed.
  const classIds = [
    ...new Set(
      pendingAgreements
        .map((r) => r.classId)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const classes: InboxClass[] = (
    await Promise.all(classIds.map((id) => ClassRepository.findById(id)))
  ).filter((c): c is NonNullable<typeof c> => c !== undefined);

  const items = buildInboxItems({
    now,
    inquiries,
    charges: scan.charges,
    studentNames: new Map(scan.students.map((s) => [s.id, s.name])),
    nextLessonAt: nextLessonByStudent(scan.lessons, now),
    craftClubMembers,
    agreementRequests: pendingAgreements,
    classes,
    needsAttention: scan.groups,
    syncConflicts,
  });

  const dismissals = await InboxDismissalRepository.findByKeys(
    items.map((item) => item.key)
  );
  return {
    items: withoutDismissed(items, new Set(dismissals.map((d) => d.key))),
  };
}
