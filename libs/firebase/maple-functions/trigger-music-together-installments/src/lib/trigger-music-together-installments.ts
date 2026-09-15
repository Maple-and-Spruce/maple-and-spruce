/**
 * triggerMusicTogetherInstallments — the admin-callable twin of the
 * `chargeMusicTogetherInstallments` schedule (#508).
 *
 * Manual catch-up if the schedule misfires, an optional dry run, and the way
 * integration tests reach the charge run at all: `onSchedule` is not callable
 * over HTTP in the Firebase emulator, an admin HTTPS endpoint is.
 *
 * Charges against the **Music Together** Square account (`MT_SQUARE_KEYS`),
 * which settles to a different business than Maple & Spruce (#791).
 *
 * It lives in its own library because **one library deploys exactly one Cloud
 * Function** — CI derives the deploy filter from the library directory name, so
 * a second export co-located with the schedule would simply never be deployed
 * (#872).
 */
import { Functions, Role } from '@maple/firebase/functions';
import {
  Square,
  MT_SQUARE_SECRET_NAMES,
  MT_SQUARE_STRING_NAMES,
  MT_SQUARE_KEYS,
} from '@maple/firebase/square';
import { runDueInstallmentCharges } from '@maple/firebase/maple-functions/charge-music-together-installments';
import type {
  ChargeMusicTogetherInstallmentsRequest,
  MusicTogetherInstallmentChargeResult,
} from '@maple/ts/firebase/api-types';

export const triggerMusicTogetherInstallments = Functions.endpoint
  .requiringRole(Role.Admin)
  .usingSecrets(...MT_SQUARE_SECRET_NAMES)
  .usingStrings(...MT_SQUARE_STRING_NAMES)
  .handle<
    ChargeMusicTogetherInstallmentsRequest,
    MusicTogetherInstallmentChargeResult
  >(async (data, _context, secrets, strings) => {
    const square = new Square(secrets, strings, MT_SQUARE_KEYS);
    return runDueInstallmentCharges(new Date(), square, {
      dryRun: data?.dryRun === true,
    });
  });
