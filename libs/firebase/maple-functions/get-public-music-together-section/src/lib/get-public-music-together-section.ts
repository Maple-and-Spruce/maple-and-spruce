/**
 * Get Public Music Together Section Cloud Function
 *
 * Loads a single Music Together section for the public checkout widget (no
 * auth). Returns a customer-safe projection plus live family availability so
 * the widget can show "spots remaining" and switch to the waitlist when full.
 * Deployed to us-east4 via CI/CD (maple-core codebase).
 */
import { Functions } from '@maple/firebase/functions';
import {
  MusicTogetherSectionRepository,
  MusicTogetherRegistrationRepository,
} from '@maple/firebase/database';
import { mtSpotsRemaining, mtSectionEnrollmentOpen } from '@maple/ts/domain';
import type {
  GetPublicMusicTogetherSectionRequest,
  GetPublicMusicTogetherSectionResponse,
  PublicMusicTogetherSection,
} from '@maple/ts/firebase/api-types';

// Keep warm in prod only — dev/emulator/CI run cold.
const minInstances =
  process.env['GCLOUD_PROJECT'] === 'maple-and-spruce' ? 1 : 0;

export const getPublicMusicTogetherSection = Functions.endpoint
  .withOptions({ minInstances, concurrency: 80 })
  .handle<
    GetPublicMusicTogetherSectionRequest,
    GetPublicMusicTogetherSectionResponse
  >(async (data) => {
    if (!data.sectionId) {
      throw new Error('Section ID is required');
    }

    const section = await MusicTogetherSectionRepository.findById(
      data.sectionId
    );
    if (!section) {
      throw new Error(`Music Together section not found: ${data.sectionId}`);
    }
    // Only visible sections are publicly available.
    if (!section.visible) {
      throw new Error('This section is not available');
    }

    const familyCount =
      await MusicTogetherRegistrationRepository.countBySectionId(section.id);

    const publicSection: PublicMusicTogetherSection = {
      id: section.id,
      name: section.name,
      description: section.description,
      sessions: section.sessions.map((s) => ({
        dateTime: s.dateTime.toISOString(),
      })),
      priceFullCents: section.priceFullCents,
      installmentPlan: section.installmentPlan?.map((i) => ({
        amountCents: i.amountCents,
        dueAt: i.dueAt.toISOString(),
      })),
      capacityFamilies: section.capacityFamilies,
      spotsRemaining: mtSpotsRemaining(section, familyCount),
      enrollmentOpen: mtSectionEnrollmentOpen(section, new Date(), familyCount),
      enrollmentOpensAt: section.enrollmentOpensAt?.toISOString(),
      location: section.location,
      room: section.room,
    };

    return { section: publicSection };
  });
