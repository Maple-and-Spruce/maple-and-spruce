/**
 * Resource-ownership checks layered on top of role gates (scoped-roles
 * epic #617, phase 2).
 *
 * Lesson teachers can READ all lessons but MUTATE only their own. The role
 * gate (`requiringRole([Role.Admin, Role.LessonTeacher])`) admits them to a
 * mutation function; this helper then enforces that a non-admin caller only
 * touches lessons taught by the instructor record linked to their login.
 *
 * A lesson's owner is its `teacherId` (an Instructor id). A caller's identity
 * is resolved via `InstructorRepository.findByUid` — an instructor record
 * whose `uid` is the caller's Firebase Auth UID.
 */
import { InstructorRepository, LessonRepository } from '@maple/firebase/database';
import { hasRole, Role } from './auth.utility';
import { throwPermissionDenied } from './errors.utility';
import type { FunctionContext } from './functions.utility';

/**
 * The instructor id linked to a portal user, or undefined when the user
 * isn't linked to any instructor record.
 */
export async function instructorIdForUser(
  uid: string | undefined
): Promise<string | undefined> {
  if (!uid) return undefined;
  const instructor = await InstructorRepository.findByUid(uid);
  return instructor?.id;
}

/**
 * Enforce "lesson teachers manage only their own lessons".
 *
 * Passes unconditionally for admins. For anyone else (a lesson-teacher, since
 * the role gate already excludes other roles) it passes only when their linked
 * instructor id equals `lessonTeacherId`. Throws permission-denied otherwise —
 * including when the caller isn't linked to any instructor record.
 *
 * Call this AFTER `requiringRole([Role.Admin, Role.LessonTeacher])` and after
 * loading the target lesson (use `lesson.teacherId`), or, on create, with the
 * `teacherId` the new lesson would be assigned.
 */
export async function assertOwnsAsInstructor(
  context: FunctionContext,
  ownerInstructorId: string | undefined,
  message: string
): Promise<void> {
  const uid = context.uid;
  if (uid && (await hasRole(uid, Role.Admin))) return;

  const myInstructorId = await instructorIdForUser(uid);
  // A non-admin passes only when linked to the exact instructor who owns the
  // resource. An unlinked caller (myInstructorId undefined) or an undefined
  // owner never matches -> denied.
  if (myInstructorId && myInstructorId === ownerInstructorId) return;

  throwPermissionDenied(message);
}

/**
 * Read-scope for the caller: whether they're an admin (sees everything) and,
 * if not, the instructor id their login is linked to (scopes list reads to
 * their own records). A non-admin who isn't linked has `instructorId:
 * undefined` — callers should return an empty result for them.
 */
export async function instructorScopeForUser(
  context: FunctionContext
): Promise<{ isAdmin: boolean; instructorId: string | undefined }> {
  const uid = context.uid;
  const isAdmin = !!uid && (await hasRole(uid, Role.Admin));
  const instructorId = isAdmin ? undefined : await instructorIdForUser(uid);
  return { isAdmin, instructorId };
}

/**
 * Enforce "lesson teachers manage only their own lessons" — see
 * {@link assertOwnsAsInstructor}. `lessonTeacherId` is the lesson's teacherId.
 */
export async function assertCanManageLesson(
  context: FunctionContext,
  lessonTeacherId: string | undefined
): Promise<void> {
  return assertOwnsAsInstructor(
    context,
    lessonTeacherId,
    'You can only manage lessons you teach.'
  );
}

/**
 * Enforce "lesson teachers manage only their own students". A student's owner
 * is its `primaryTeacherId` (an Instructor id). Admins pass; a lesson-teacher
 * passes only when it's their student.
 */
export async function assertCanManageStudent(
  context: FunctionContext,
  primaryTeacherId: string | undefined
): Promise<void> {
  return assertOwnsAsInstructor(
    context,
    primaryTeacherId,
    'You can only manage your own students.'
  );
}

/**
 * Enforce "lesson teachers record payments only on their own students'
 * lessons" (#631 — the teacher My Day page).
 *
 * Passes unconditionally for admins. For a lesson-teacher it passes only when
 * the invoice has at least one line item referencing a lesson taught by their
 * linked instructor. An invoice with no lesson-linked line (a free-form
 * invoice) is admin-only. Call AFTER the role gate and after loading the
 * invoice.
 */
export async function assertCanRecordInvoicePayment(
  context: FunctionContext,
  invoice: { lineItems: ReadonlyArray<{ lessonId?: string }> }
): Promise<void> {
  const uid = context.uid;
  if (uid && (await hasRole(uid, Role.Admin))) return;

  const myInstructorId = await instructorIdForUser(uid);
  if (myInstructorId) {
    const lessonIds = invoice.lineItems
      .map((line) => line.lessonId)
      .filter((id): id is string => !!id);
    for (const lessonId of lessonIds) {
      const lesson = await LessonRepository.findById(lessonId);
      if (lesson && lesson.teacherId === myInstructorId) return;
    }
  }

  throwPermissionDenied(
    "You can only record payments on your own students' lessons."
  );
}
