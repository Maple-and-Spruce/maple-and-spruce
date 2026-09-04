/**
 * Waive Music Together Installment Cloud Function (admin / MT teacher)
 *
 * Forgives one scheduled installment without cancelling the registration: the
 * family keeps its seat and every other charge, and this one is simply never
 * taken. Written for the pilot-semester half-off (#791), where families who
 * came to the demo were promised half tuition *after* some had already
 * registered — for a family on the two-installment plan, waiving installment 2
 * lands them on exactly half the plan total, so no refund is involved.
 *
 * Why a distinct `waived` status rather than reusing `cancelled`:
 * `cancelled` is written by `cancelMusicTogetherRegistration` and means the
 * family left the program. Both statuses stop the charge job, but only one of
 * them should read as "still enrolled, deliberately comped" on the roster.
 * The reason and the waiving admin are recorded on the charge for the same
 * reason — a charge that silently never ran is indistinguishable from a bug.
 *
 * Safety: the status check and the write share one Firestore transaction
 * (`tryWaive`), so this cannot race `chargeMusicTogetherInstallments` into a
 * double outcome. A charge that is already `charging`, `paid`, `failed`, or
 * `cancelled` is refused — money has moved, or the family is gone, and either
 * way the fix is a refund, not a rewrite.
 *
 * Deployed to us-east4 via CI/CD (maple-core codebase — no Square dependency;
 * waiving takes no payment and needs no MT credentials).
 */
import {
  Functions,
  Role,
  throwInvalidArgument,
  throwFailedPrecondition,
  throwNotFound,
} from '@maple/firebase/functions';
import {
  MusicTogetherScheduledChargeRepository,
  MusicTogetherRegistrationRepository,
} from '@maple/firebase/database';
import type {
  WaiveMusicTogetherInstallmentRequest,
  WaiveMusicTogetherInstallmentResponse,
} from '@maple/ts/firebase/api-types';

/** Recorded when an admin waives without typing a reason. */
const DEFAULT_REASON = 'Waived by an administrator';

const MAX_REASON_LENGTH = 500;

export const waiveMusicTogetherInstallment = Functions.endpoint
  .requiringRole([Role.Admin, Role.MtTeacher])
  .handle<
    WaiveMusicTogetherInstallmentRequest,
    WaiveMusicTogetherInstallmentResponse
  >(async (data, context) => {
    if (!data.chargeId) {
      throwInvalidArgument('Charge ID is required');
    }

    const reason = data.reason?.trim() || DEFAULT_REASON;
    if (reason.length > MAX_REASON_LENGTH) {
      throwInvalidArgument(
        `Reason must be ${MAX_REASON_LENGTH} characters or fewer`
      );
    }

    const charge = await MusicTogetherScheduledChargeRepository.findById(
      data.chargeId
    );
    if (!charge) {
      throwNotFound('Music Together scheduled charge', data.chargeId);
    }

    // Refuse on a registration that is no longer active: cancelling already
    // flips its charges to `cancelled`, and "waiving" a departed family's
    // charge would misreport why the money never moved.
    const registration = await MusicTogetherRegistrationRepository.findById(
      charge.registrationId
    );
    if (!registration) {
      throwNotFound('Music Together registration', charge.registrationId);
    }
    if (
      registration.status === 'cancelled' ||
      registration.status === 'refunded'
    ) {
      throwFailedPrecondition(
        'This registration is already cancelled — its scheduled charges will never be taken.'
      );
    }

    const waived = await MusicTogetherScheduledChargeRepository.tryWaive(
      data.chargeId,
      reason,
      context.uid ?? 'unknown'
    );
    if (!waived) {
      // `tryWaive` returns undefined only when the charge left `scheduled`
      // between the read above and the transaction — report what it became.
      const current = await MusicTogetherScheduledChargeRepository.findById(
        data.chargeId
      );
      throwFailedPrecondition(
        current?.status === 'paid'
          ? 'This installment has already been charged. Issue a refund instead of waiving it.'
          : `This installment can no longer be waived (status: ${current?.status ?? 'unknown'}).`
      );
    }

    return {
      chargeId: waived.id,
      status: 'waived',
      amountCents: waived.amountCents,
    };
  });
