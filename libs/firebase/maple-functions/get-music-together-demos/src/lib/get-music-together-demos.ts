/**
 * Get Music Together Demos Cloud Function (admin)
 *
 * Lists Music Together demo classes for the admin app (authenticated). Also
 * returns per-demo RSVP counts (confirmed vs waitlisted) so the admin table can
 * show how full each demo is without opening the RSVP viewer. Gated to Admin +
 * MtTeacher. Deployed to us-east4 via CI/CD (maple-core codebase).
 */
import { createRoleFunction, Role } from '@maple/firebase/functions';
import {
  MusicTogetherDemoRepository,
  MusicTogetherDemoRsvpRepository,
} from '@maple/firebase/database';
import type {
  GetMusicTogetherDemosRequest,
  GetMusicTogetherDemosResponse,
  MusicTogetherDemoCounts,
} from '@maple/ts/firebase/api-types';

export const getMusicTogetherDemos = createRoleFunction<
  GetMusicTogetherDemosRequest,
  GetMusicTogetherDemosResponse
>(async () => {
  const demos = await MusicTogetherDemoRepository.findAll();

  const counts: Record<string, MusicTogetherDemoCounts> = {};
  await Promise.all(
    demos.map(async (demo) => {
      const [confirmed, waitlisted] = await Promise.all([
        MusicTogetherDemoRsvpRepository.countByDemoIdAndStatus(
          demo.id,
          'confirmed'
        ),
        MusicTogetherDemoRsvpRepository.countByDemoIdAndStatus(
          demo.id,
          'waitlisted'
        ),
      ]);
      if (confirmed > 0 || waitlisted > 0) {
        counts[demo.id] = { confirmed, waitlisted };
      }
    })
  );

  return { demos, counts };
}, [Role.Admin, Role.MtTeacher]);
