/**
 * Get Music Together Sections Cloud Function
 *
 * Lists Music Together sections for the admin app (authenticated). Optional
 * semester filter. Also returns per-section registration counts so the admin
 * table can show how full each section is without opening the roster. The
 * section's overall status is DERIVED client-side from its explicit controls.
 * Deployed to us-east4 via CI/CD (maple-core codebase).
 */
import {
  createRoleFunction,
  Role,
} from '@maple/firebase/functions';
import {
  MusicTogetherSectionRepository,
  MusicTogetherRegistrationRepository,
} from '@maple/firebase/database';
import { MT_CAPACITY_STATUSES } from '@maple/ts/domain';
import type {
  GetMusicTogetherSectionsRequest,
  GetMusicTogetherSectionsResponse,
  MusicTogetherSectionCounts,
} from '@maple/ts/firebase/api-types';

export const getMusicTogetherSections = createRoleFunction<
  GetMusicTogetherSectionsRequest,
  GetMusicTogetherSectionsResponse
>(async (data) => {
  const sections = await MusicTogetherSectionRepository.findAll({
    semesterId: data.semesterId,
  });

  // Per-section registration counts in one query, grouped in memory. Count the
  // same statuses as capacity/spotsRemaining (pending + confirmed) so
  // "registered" matches the section's taken spots.
  const registrations = await MusicTogetherRegistrationRepository.findAll();
  const counts: Record<string, MusicTogetherSectionCounts> = {};
  for (const section of sections) {
    counts[section.id] = { families: 0, children: 0 };
  }
  for (const reg of registrations) {
    if (!MT_CAPACITY_STATUSES.includes(reg.status)) continue;
    const entry = counts[reg.sectionId];
    if (!entry) continue; // registration for a section not in this result set
    entry.families += 1;
    entry.children += reg.children.length;
  }

  return { sections, counts };
}, [Role.Admin, Role.MtTeacher]);
