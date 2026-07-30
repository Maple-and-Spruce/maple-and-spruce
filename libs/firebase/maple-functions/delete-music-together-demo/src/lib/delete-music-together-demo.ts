/**
 * Delete Music Together Demo Cloud Function (admin)
 *
 * Deletes a demo class. The `onMusicTogetherDemoWrite` trigger removes the
 * associated public calendar event; the demo's RSVP subcollection is orphaned
 * (no production data yet, and RSVPs are contact-only follow-up data). Gated to
 * Admin + MtTeacher. Deployed to us-east4 via CI/CD (maple-core).
 */
import {
  createRoleFunction,
  throwInvalidArgument,
  throwNotFound,
  Role,
} from '@maple/firebase/functions';
import { MusicTogetherDemoRepository } from '@maple/firebase/database';
import type {
  DeleteMusicTogetherDemoRequest,
  DeleteMusicTogetherDemoResponse,
} from '@maple/ts/firebase/api-types';

export const deleteMusicTogetherDemo = createRoleFunction<
  DeleteMusicTogetherDemoRequest,
  DeleteMusicTogetherDemoResponse
>(async (data) => {
  if (!data.id) throwInvalidArgument('Demo ID is required');

  const existing = await MusicTogetherDemoRepository.findById(data.id);
  if (!existing) throwNotFound('Music Together demo', data.id);

  await MusicTogetherDemoRepository.delete(data.id);
  return { deleted: true };
}, [Role.Admin, Role.MtTeacher]);
