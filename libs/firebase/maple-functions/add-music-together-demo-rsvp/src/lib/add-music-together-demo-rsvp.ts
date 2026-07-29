/**
 * Add Music Together Demo RSVP Cloud Function
 *
 * Public (no auth) endpoint the demo-class RSVP widget calls when a family
 * reserves a spot at a FREE Music Together demo class. Captures the chosen slot
 * label, name, and email into `musicTogetherDemoRsvps/{emailKey}`. Idempotent —
 * a repeat RSVP with the same email updates the chosen slot/name and returns
 * `added: false`.
 *
 * Demos are free: there is NO section, NO capacity gate, and NO payment.
 *
 * Deployed to us-east4 via CI/CD (maple-core codebase).
 */
import {
  Functions,
  throwValidationError,
} from '@maple/firebase/functions';
import { MusicTogetherDemoRsvpRepository } from '@maple/firebase/database';
import { musicTogetherDemoRsvpValidation } from '@maple/ts/validation';
import type {
  AddMusicTogetherDemoRsvpRequest,
  AddMusicTogetherDemoRsvpResponse,
} from '@maple/ts/firebase/api-types';

export const addMusicTogetherDemoRsvp = Functions.endpoint
  .withOptions({ concurrency: 80 })
  .handle<
    AddMusicTogetherDemoRsvpRequest,
    AddMusicTogetherDemoRsvpResponse
  >(async (data) => {
    const result = musicTogetherDemoRsvpValidation({
      demoSlot: data.demoSlot,
      name: data.name,
      email: data.email,
    });
    if (result.hasErrors()) {
      throwValidationError(result.getErrors());
    }

    const { created } = await MusicTogetherDemoRsvpRepository.add({
      demoSlot: data.demoSlot,
      name: data.name,
      email: data.email,
    });

    return { added: created };
  });
