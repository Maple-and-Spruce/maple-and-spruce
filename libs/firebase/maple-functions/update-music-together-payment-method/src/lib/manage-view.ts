/**
 * Build the customer-safe manage-page view for an installment registration.
 *
 * Pure assembly (no I/O) from an already-loaded registration, its section, and
 * its scheduled charges. Shared shape between `startMusicTogetherManageSession`
 * and `updateMusicTogetherPaymentMethod`. Duplicated in both function libs to
 * keep Nx library boundaries clean (it depends on the api-types view shape,
 * which the domain layer cannot import).
 */
import {
  mtNextActionableCharge,
  type MusicTogetherRegistration,
  type MusicTogetherSection,
  type MusicTogetherScheduledCharge,
} from '@maple/ts/domain';
import type { MusicTogetherManageView } from '@maple/ts/firebase/api-types';

const fmtMoney = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

const fmtDate = (d: Date): string =>
  d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  });

export function buildMusicTogetherManageView(
  registration: MusicTogetherRegistration,
  section: MusicTogetherSection | undefined,
  charges: MusicTogetherScheduledCharge[]
): MusicTogetherManageView {
  const next = mtNextActionableCharge(charges);
  return {
    registrationId: registration.id,
    sectionName: section?.name ?? 'Music Together',
    parentName:
      registration.parentNames[0] ??
      `${registration.adultFirstName} ${registration.adultLastName}`.trim(),
    nextInstallment: next
      ? {
          amountCents: next.amountCents,
          amountLabel: fmtMoney(next.amountCents),
          dueAt: next.dueAt.toISOString(),
          dueLabel: fmtDate(next.dueAt),
          status: next.status,
        }
      : undefined,
  };
}
