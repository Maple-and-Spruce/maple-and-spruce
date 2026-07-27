/**
 * Get Music Together Roster Cloud Function (admin)
 *
 * Returns a section's enrolled families with each registration's scheduled
 * charges and a `pastDue` flag (any failed charge). Admin-only because it
 * exposes family PII including children's dates of birth.
 *
 * The admin app builds the licensee CSV (parent, child, child DOB) from these
 * registrations client-side via `buildMusicTogetherLicenseeCsv`.
 *
 * Deployed to us-east4 via CI/CD (maple-core codebase).
 */
import {
  createRoleFunction,
  throwNotFound,
  Role,
} from '@maple/firebase/functions';
import {
  MusicTogetherSectionRepository,
  MusicTogetherRegistrationRepository,
  MusicTogetherScheduledChargeRepository,
  MusicTogetherWaitlistRepository,
} from '@maple/firebase/database';
import { mtHasFailedCharge } from '@maple/ts/domain';
import type {
  GetMusicTogetherRosterRequest,
  GetMusicTogetherRosterResponse,
  MusicTogetherRosterEntry,
} from '@maple/ts/firebase/api-types';

export const getMusicTogetherRoster = createRoleFunction<
  GetMusicTogetherRosterRequest,
  GetMusicTogetherRosterResponse
>(async (data) => {
  if (!data.sectionId) {
    throw new Error('Section ID is required');
  }

  const section = await MusicTogetherSectionRepository.findById(data.sectionId);
  if (!section) {
    throwNotFound('Music Together section', data.sectionId);
  }

  const [registrations, charges, waitlist] = await Promise.all([
    MusicTogetherRegistrationRepository.findBySectionId(data.sectionId),
    MusicTogetherScheduledChargeRepository.findAll({
      sectionId: data.sectionId,
    }),
    MusicTogetherWaitlistRepository.findBySectionId(data.sectionId),
  ]);

  // Group charges by registration for the per-family view.
  const chargesByRegistration = new Map<
    string,
    (typeof charges)[number][]
  >();
  for (const charge of charges) {
    const list = chargesByRegistration.get(charge.registrationId) ?? [];
    list.push(charge);
    chargesByRegistration.set(charge.registrationId, list);
  }

  const entries: MusicTogetherRosterEntry[] = registrations.map(
    (registration) => {
      const regCharges = chargesByRegistration.get(registration.id) ?? [];
      return {
        registration,
        charges: regCharges,
        pastDue: mtHasFailedCharge(regCharges),
      };
    }
  );

  return { section, entries, waitlist };
}, [Role.Admin, Role.MtTeacher]);
