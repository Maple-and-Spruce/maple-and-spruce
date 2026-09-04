'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import { callDeduped } from './call-deduped';
import type { RequestState } from '@maple/ts/domain';
import type {
  GetMusicTogetherRosterRequest,
  GetMusicTogetherRosterResponse,
  MusicTogetherRosterEntry,
  CancelMusicTogetherRegistrationRequest,
  CancelMusicTogetherRegistrationResponse,
  WaiveMusicTogetherInstallmentRequest,
  WaiveMusicTogetherInstallmentResponse,
} from '@maple/ts/firebase/api-types';

/** Hydrate ISO date strings in a roster entry back into Dates. */
function hydrateEntry(entry: MusicTogetherRosterEntry): MusicTogetherRosterEntry {
  return {
    ...entry,
    registration: {
      ...entry.registration,
      children: (entry.registration.children ?? []).map((c) => ({
        name: c.name,
        dob: new Date(c.dob),
      })),
      createdAt: new Date(entry.registration.createdAt),
      updatedAt: new Date(entry.registration.updatedAt),
    },
    charges: (entry.charges ?? []).map((c) => ({
      ...c,
      dueAt: new Date(c.dueAt),
    })),
  };
}

/**
 * Hook that loads a Music Together section's roster (enrolled families +
 * scheduled-charge status). Pass `undefined` to stay idle (no section open).
 */
export function useMusicTogetherRoster(sectionId: string | undefined) {
  const [rosterState, setRosterState] = useState<
    RequestState<GetMusicTogetherRosterResponse>
  >({ status: 'idle' });

  const fetchRoster = useCallback(async () => {
    if (!sectionId) {
      setRosterState({ status: 'idle' });
      return;
    }
    setRosterState({ status: 'loading' });
    try {
      const result = await callDeduped<
        GetMusicTogetherRosterRequest,
        GetMusicTogetherRosterResponse
      >('getMusicTogetherRoster', { sectionId });
      setRosterState({
        status: 'success',
        data: {
          section: result.data.section,
          entries: result.data.entries.map(hydrateEntry),
          // Hydrate the waitlist entries' ISO createdAt back into Dates.
          waitlist: (result.data.waitlist ?? []).map((w) => ({
            ...w,
            createdAt: new Date(w.createdAt),
          })),
        },
      });
    } catch (error) {
      console.error('Failed to fetch Music Together roster:', error);
      setRosterState({
        status: 'error',
        error:
          error instanceof Error ? error.message : 'Failed to fetch roster',
      });
    }
  }, [sectionId]);

  useEffect(() => {
    fetchRoster();
  }, [fetchRoster]);

  /**
   * Cancel a family's registration with an optional refund. Omit `refundCents`
   * to apply the program's policy refund (paid − $25 before the first class;
   * $0 after); pass an explicit amount for a partial/full refund. Reloads the
   * roster on success so the updated status shows.
   */
  const cancelRegistration = useCallback(
    async (
      registrationId: string,
      refundCents?: number
    ): Promise<CancelMusicTogetherRegistrationResponse> => {
      const functions = getMapleFunctions();
      const cancel = httpsCallable<
        CancelMusicTogetherRegistrationRequest,
        CancelMusicTogetherRegistrationResponse
      >(functions, 'cancelMusicTogetherRegistration');
      const result = await cancel({
        registrationId,
        ...(refundCents !== undefined ? { refundCents } : {}),
      });
      await fetchRoster();
      return result.data;
    },
    [fetchRoster]
  );

  /**
   * Forgive one scheduled installment without cancelling the registration —
   * the family keeps its seat and simply never owes this charge. Used for
   * comped tuition (the pilot-semester half-off, #791). Reloads the roster so
   * the charge shows as waived.
   */
  const waiveInstallment = useCallback(
    async (
      chargeId: string,
      reason?: string
    ): Promise<WaiveMusicTogetherInstallmentResponse> => {
      const functions = getMapleFunctions();
      const waive = httpsCallable<
        WaiveMusicTogetherInstallmentRequest,
        WaiveMusicTogetherInstallmentResponse
      >(functions, 'waiveMusicTogetherInstallment');
      const result = await waive({
        chargeId,
        ...(reason ? { reason } : {}),
      });
      await fetchRoster();
      return result.data;
    },
    [fetchRoster]
  );

  return { rosterState, fetchRoster, cancelRegistration, waiveInstallment };
}
