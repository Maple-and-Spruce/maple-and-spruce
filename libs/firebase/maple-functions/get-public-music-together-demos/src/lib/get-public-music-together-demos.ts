/**
 * Get Public Music Together Demos Cloud Function
 *
 * Public (no auth) list of upcoming, visible demo classes for the demo RSVP
 * widget. Returns only customer-safe fields plus live availability
 * (spotsRemaining / isFull) — never any RSVP PII. Deployed to us-east4 via
 * CI/CD (maple-core codebase).
 */
import { Functions } from '@maple/firebase/functions';
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

// Keep warm in prod only — the demo RSVP widget fetches this on mount, so a
// cold start would slow the first ad visitor's page load (warmup is too late
// for first paint). Mirrors getPublicMusicTogetherSection. dev/emulator/CI cold.
const minInstances =
  process.env['GCLOUD_PROJECT'] === 'maple-and-spruce' ? 1 : 0;

export const getPublicMusicTogetherDemos = Functions.endpoint
  .withOptions({ minInstances, concurrency: 80 })
  .handle<
    GetPublicMusicTogetherDemosRequest,
    GetPublicMusicTogetherDemosResponse
  >(async () => {
    // Repository already filters to visible && dateTime >= now, soonest first.
    const demos = await MusicTogetherDemoRepository.findUpcomingVisible(
      new Date()
    );

    const options: PublicMusicTogetherDemo[] = await Promise.all(
      demos.map(async (demo) => {
        const confirmedCount =
          await MusicTogetherDemoRsvpRepository.countByDemoIdAndStatus(
            demo.id,
            'confirmed'
          );
        return {
          id: demo.id,
          dateTime: demo.dateTime.toISOString(),
          location: demo.location,
          durationMinutes: mtDemoDurationMinutes(demo),
          spotsRemaining: mtDemoSpotsRemaining(demo, confirmedCount),
          isFull: confirmedCount >= demo.capacityFamilies,
        };
      })
    );

    return { demos: options };
  });
