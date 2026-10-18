/**
 * Get Public Music Together Demos Cloud Function
 *
 * Public (no auth) list of upcoming, visible demo classes for the demo RSVP
 * widget. Returns only customer-safe fields plus live availability
 * (spotsRemaining / isFull) — never any RSVP PII. Deployed to us-east4 via
 * CI/CD (maple-core codebase).
 */
import {
  MusicTogetherDemoRepository,
  MusicTogetherDemoRsvpRepository,
} from '@maple/firebase/database';
import { mtDemoDurationMinutes, mtDemoSpotsRemaining } from '@maple/ts/domain';
import type {
  GetPublicMusicTogetherDemosRequest,
  GetPublicMusicTogetherDemosResponse,
  PublicMusicTogetherDemo,
} from '@maple/ts/firebase/api-types';

export async function getPublicMusicTogetherDemos(): Promise<GetPublicMusicTogetherDemosResponse> {
  // Repository already filters to visible && dateTime >= now, soonest first.
  const demos = await MusicTogetherDemoRepository.findUpcomingVisible(
    new Date(),
  );

  const options: PublicMusicTogetherDemo[] = await Promise.all(
    demos.map(async (demo) => {
      const confirmedCount =
        await MusicTogetherDemoRsvpRepository.countByDemoIdAndStatus(
          demo.id,
          'confirmed',
        );
      return {
        id: demo.id,
        dateTime: demo.dateTime.toISOString(),
        location: demo.location,
        durationMinutes: mtDemoDurationMinutes(demo),
        spotsRemaining: mtDemoSpotsRemaining(demo, confirmedCount),
        isFull: confirmedCount >= demo.capacityFamilies,
      };
    }),
  );

  return { demos: options };
}
