/**
 * Start Music Together Manage Session Cloud Function (public)
 *
 * Exchanges a single-use magic-link token for a short-lived session. The access
 * token is consumed (marked used) so the link cannot be replayed; the returned
 * session token authorizes the subsequent card-update call. Also returns a
 * customer-safe snapshot (section + next installment) so the manage page can
 * show which charge the new card will cover.
 *
 * Deployed to us-east4 via CI/CD (maple-core codebase).
 */
import {
  createPublicFunction,
  throwInvalidArgument,
  throwFailedPrecondition,
} from '@maple/firebase/functions';
import {
  MusicTogetherRegistrationRepository,
  MusicTogetherSectionRepository,
  MusicTogetherScheduledChargeRepository,
  MusicTogetherTokenRepository,
} from '@maple/firebase/database';
import { buildMusicTogetherManageView } from './manage-view';
import type {
  StartMusicTogetherManageSessionRequest,
  StartMusicTogetherManageSessionResponse,
} from '@maple/ts/firebase/api-types';

export const startMusicTogetherManageSession = createPublicFunction<
  StartMusicTogetherManageSessionRequest,
  StartMusicTogetherManageSessionResponse
>(async (data) => {
  if (!data.token) throwInvalidArgument('Token is required');

  const registrationId =
    await MusicTogetherTokenRepository.consumeAccessToken(data.token);
  if (!registrationId) {
    throwFailedPrecondition(
      'This link is invalid or has expired. Please request a new one.'
    );
  }

  const registration =
    await MusicTogetherRegistrationRepository.findById(registrationId);
  if (
    !registration ||
    registration.status === 'cancelled' ||
    registration.status === 'refunded'
  ) {
    throwFailedPrecondition('This registration can no longer be managed.');
  }

  const [section, charges] = await Promise.all([
    MusicTogetherSectionRepository.findById(registration.sectionId),
    MusicTogetherScheduledChargeRepository.findByRegistrationId(
      registration.id
    ),
  ]);

  const sessionToken = await MusicTogetherTokenRepository.createSession(
    registration.id
  );

  return {
    sessionToken,
    registration: buildMusicTogetherManageView(registration, section, charges),
  };
});
