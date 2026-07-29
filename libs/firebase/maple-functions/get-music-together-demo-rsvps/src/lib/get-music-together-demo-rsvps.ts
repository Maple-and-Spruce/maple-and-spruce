/**
 * Get Music Together Demo RSVPs Cloud Function (admin)
 *
 * Returns every free demo-class RSVP (name, email, chosen slot) so the Owner
 * and the MT teacher can see who's coming and follow up. Ordered by signup
 * time. Gated to Admin + MtTeacher because it exposes family contact PII.
 *
 * Deployed to us-east4 via CI/CD (maple-core codebase).
 */
import { createRoleFunction, Role } from '@maple/firebase/functions';
import { MusicTogetherDemoRsvpRepository } from '@maple/firebase/database';
import type {
  GetMusicTogetherDemoRsvpsRequest,
  GetMusicTogetherDemoRsvpsResponse,
} from '@maple/ts/firebase/api-types';

export const getMusicTogetherDemoRsvps = createRoleFunction<
  GetMusicTogetherDemoRsvpsRequest,
  GetMusicTogetherDemoRsvpsResponse
>(async () => {
  const rsvps = await MusicTogetherDemoRsvpRepository.findAll();
  return { rsvps };
}, [Role.Admin, Role.MtTeacher]);
