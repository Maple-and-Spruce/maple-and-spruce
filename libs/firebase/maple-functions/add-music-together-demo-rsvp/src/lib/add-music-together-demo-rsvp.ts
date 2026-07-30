/**
 * Add Music Together Demo RSVP Cloud Function
 *
 * Public (no auth) endpoint the demo-class RSVP widget calls when a family
 * reserves a spot at a FREE Music Together demo. Takes the chosen `demoId` plus
 * name + email. Looks up the demo (must exist and be visible), then reserves a
 * spot in a capacity-gated transaction: `confirmed` while under the demo's
 * family cap, otherwise `waitlisted`.
 *
 * Idempotent per (demo, email): a repeat RSVP returns the family's existing
 * status with `added: false`. Demos are free — no payment, no Square.
 *
 * Deployed to us-east4 via CI/CD (maple-core codebase).
 */
import {
  Functions,
  throwValidationError,
  throwNotFound,
  throwFailedPrecondition,
} from '@maple/firebase/functions';
import {
  MusicTogetherDemoRepository,
  MusicTogetherDemoRsvpRepository,
} from '@maple/firebase/database';
import { musicTogetherDemoRsvpValidation } from '@maple/ts/validation';
import type {
  AddMusicTogetherDemoRsvpRequest,
  AddMusicTogetherDemoRsvpResponse,
} from '@maple/ts/firebase/api-types';

export const addMusicTogetherDemoRsvp = Functions.endpoint
  .withOptions({ concurrency: 80 })
  .handle<AddMusicTogetherDemoRsvpRequest, AddMusicTogetherDemoRsvpResponse>(
    async (data) => {
      const result = musicTogetherDemoRsvpValidation({
        demoId: data.demoId,
        name: data.name,
        email: data.email,
      });
      if (result.hasErrors()) {
        throwValidationError(result.getErrors());
      }

      // The demo must exist and be publicly visible to accept RSVPs.
      const demo = await MusicTogetherDemoRepository.findById(data.demoId);
      if (!demo) {
        throwNotFound('Music Together demo', data.demoId);
      }
      if (!demo.visible) {
        throwFailedPrecondition('This demo is not open for RSVPs.');
      }

      const { entry, created } = await MusicTogetherDemoRsvpRepository.add({
        demoId: data.demoId,
        name: data.name,
        email: data.email,
        capacityFamilies: demo.capacityFamilies,
      });

      return { added: created, status: entry.status };
    }
  );
