/**
 * Request Music Together Manage Link Cloud Function (public)
 *
 * Emails a family a single-use magic link to update the card on file behind
 * their installment registration — so the Week-5 second charge hits the right
 * card. The response is uniform whether or not the email has a manageable
 * registration (no enumeration): only when a chargeable installment
 * registration exists do we mint a token and queue the email.
 *
 * The token is scoped to a specific registration (the card lives on the
 * registration). When a family has more than one installment registration we
 * pick the most recent — that is the one whose installment is still ahead.
 *
 * Deployed to us-east4 via CI/CD (maple-core codebase).
 */
import { Functions, throwInvalidArgument } from '@maple/firebase/functions';
import {
  MusicTogetherRegistrationRepository,
  MusicTogetherTokenRepository,
  getDb,
} from '@maple/firebase/database';
import type { MusicTogetherRegistration } from '@maple/ts/domain';
import type {
  RequestMusicTogetherManageLinkRequest,
  RequestMusicTogetherManageLinkResponse,
} from '@maple/ts/firebase/api-types';

/**
 * A registration is manageable when it is a confirmed installment plan with a
 * vaulted card on file (customer + card ids). Pay-in-full registrations have
 * nothing on file, and cancelled/refunded ones are never charged again.
 */
function isManageable(reg: MusicTogetherRegistration): boolean {
  return (
    reg.paymentPlan === 'installments' &&
    reg.status === 'confirmed' &&
    !!reg.squareCustomerId &&
    !!reg.squareCardId
  );
}

export const requestMusicTogetherManageLink = Functions.endpoint
  .usingStrings('MUSIC_TOGETHER_MANAGE_URL')
  .handle<
    RequestMusicTogetherManageLinkRequest,
    RequestMusicTogetherManageLinkResponse
  >(async (data, _context, _secrets, strings) => {
    if (!data.email) throwInvalidArgument('Email is required');

    const email = data.email.trim();
    // Registrations store the email as entered; match case-insensitively by
    // trying the exact value then a lowercased fallback.
    let candidates = await MusicTogetherRegistrationRepository.findAll({
      email,
    });
    if (candidates.length === 0 && email !== email.toLowerCase()) {
      candidates = await MusicTogetherRegistrationRepository.findAll({
        email: email.toLowerCase(),
      });
    }

    // findAll returns newest-first; take the most recent manageable one.
    const registration = candidates.find(isManageable);

    if (registration) {
      const rawToken = await MusicTogetherTokenRepository.createAccessToken(
        registration.id
      );
      const base = strings.MUSIC_TOGETHER_MANAGE_URL;
      const separator = base.includes('?') ? '&' : '?';
      const manageUrl = `${base}${separator}token=${rawToken}`;

      // Template `music-together-manage-link` is seeded via
      // tools/seed-email-templates.ts.
      await getDb()
        .collection('mail')
        .add({
          to: registration.email,
          template: {
            name: 'music-together-manage-link',
            data: { manageUrl },
          },
        });
    }

    // Always uniform — do not reveal whether the email is enrolled.
    return { ok: true };
  });
