/**
 * Get Music Together Interest Cloud Function
 *
 * Authenticated (admin) read for the cross-section interest demand view. Returns
 * every interest entry (most recent first), a per-section demand tally so the
 * admin can see which section times to add, and a section-id → name map for
 * rendering. Deployed to us-east4 via CI/CD (maple-core codebase).
 */
import { createAuthenticatedFunction } from '@maple/firebase/functions';
import {
  MusicTogetherInterestRepository,
  MusicTogetherSectionRepository,
} from '@maple/firebase/database';
import { mtInterestDemandBySection } from '@maple/ts/domain';
import type {
  GetMusicTogetherInterestRequest,
  GetMusicTogetherInterestResponse,
} from '@maple/ts/firebase/api-types';

export const getMusicTogetherInterest = createAuthenticatedFunction<
  GetMusicTogetherInterestRequest,
  GetMusicTogetherInterestResponse
>(async () => {
  const [entries, sections] = await Promise.all([
    MusicTogetherInterestRepository.findAll(),
    MusicTogetherSectionRepository.findAll(),
  ]);

  const sectionNames: Record<string, string> = {};
  for (const section of sections) {
    sectionNames[section.id] = section.name;
  }

  return {
    entries,
    demand: mtInterestDemandBySection(entries),
    sectionNames,
  };
});
