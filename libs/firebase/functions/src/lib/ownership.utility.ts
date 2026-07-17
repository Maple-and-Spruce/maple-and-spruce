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
import { InstructorRepository } from '@maple/firebase/database';
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
export async function assertCanManageLesson(
  context: FunctionContext,
  lessonTeacherId: string | undefined
): Promise<void> {
  const uid = context.uid;
  if (uid && (await hasRole(uid, Role.Admin))) return;

  const myInstructorId = await instructorIdForUser(uid);
  // A non-admin passes only when linked to the exact instructor who teaches
  // this lesson. An unlinked caller (myInstructorId undefined) or an undefined
  // owner never matches -> denied.
  if (myInstructorId && myInstructorId === lessonTeacherId) return;

  throwPermissionDenied('You can only manage lessons you teach.');
}
