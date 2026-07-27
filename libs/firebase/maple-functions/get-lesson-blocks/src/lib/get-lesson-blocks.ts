/**
 * Get Lesson Blocks Cloud Function (#686)
 *
 * Lists weekly LessonBlocks, optionally scoped to one teacher. Readable by
 * admins and lesson-teachers (a teacher needs to see their own blocks to know
 * where lessons can go); creation/editing stays admin-only.
 */
import { createRoleFunction, Role } from '@maple/firebase/functions';
import { LessonBlockRepository } from '@maple/firebase/database';
import type {
  GetLessonBlocksRequest,
  GetLessonBlocksResponse,
} from '@maple/ts/firebase/api-types';

export const getLessonBlocks = createRoleFunction<
  GetLessonBlocksRequest,
  GetLessonBlocksResponse
>(async (data) => {
  const blocks = await LessonBlockRepository.findAll({
    teacherId: data.teacherId,
  });
  return { blocks };
}, [Role.Admin, Role.LessonTeacher]);
