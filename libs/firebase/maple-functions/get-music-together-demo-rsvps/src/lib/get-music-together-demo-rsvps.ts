/**
 * Get Music Together Demo RSVPs Cloud Function (admin)
 *
 * Returns every demo class (soonest first) grouped with its RSVPs, split into
 * confirmed (seated) and waitlisted, so the Owner and MT teacher can see who's
 * coming to each demo and follow up. Gated to Admin + MtTeacher because it
 * exposes family contact PII.
 *
 * Deployed to us-east4 via CI/CD (maple-core codebase).
 */
import { createRoleFunction, Role } from '@maple/firebase/functions';
import {
  MusicTogetherDemoRepository,
  MusicTogetherDemoRsvpRepository,
} from '@maple/firebase/database';
import type {
  GetMusicTogetherDemoRsvpsRequest,
  GetMusicTogetherDemoRsvpsResponse,
  MusicTogetherDemoRsvpGroup,
} from '@maple/ts/firebase/api-types';

export const getMusicTogetherDemoRsvps = createRoleFunction<
  GetMusicTogetherDemoRsvpsRequest,
  GetMusicTogetherDemoRsvpsResponse
>(async () => {
  const demos = await MusicTogetherDemoRepository.findAll();

  const groups: MusicTogetherDemoRsvpGroup[] = await Promise.all(
    demos.map(async (demo) => {
      const rsvps = await MusicTogetherDemoRsvpRepository.findByDemoId(demo.id);
      return {
        demo,
        confirmed: rsvps.filter((r) => r.status === 'confirmed'),
        waitlisted: rsvps.filter((r) => r.status === 'waitlisted'),
      };
    })
  );

  return { demos: groups };
}, [Role.Admin, Role.MtTeacher]);
