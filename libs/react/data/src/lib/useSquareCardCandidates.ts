'use client';

/**
 * The cards already on file in Square, for linking one to a student (#81).
 *
 * Read once per student page. The ranking that turns these into suggestions is
 * `rankCardsForStudent` in the domain, so the same rules run here and on the
 * server that validates the choice.
 */
import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type { RequestState, SquareCardOnFile, Student } from '@maple/ts/domain';
import type {
  GetSquareCardCandidatesRequest,
  GetSquareCardCandidatesResponse,
  UpdateStudentSquareCardRequest,
  UpdateStudentSquareCardResponse,
} from '@maple/ts/firebase/api-types';

export interface SquareCardCandidates {
  cards: SquareCardOnFile[];
  linkedTo: Record<string, { id: string; name: string }>;
}

export function useSquareCardCandidates() {
  const [cardsState, setCardsState] = useState<
    RequestState<SquareCardCandidates>
  >({ status: 'idle' });
  const [isSaving, setIsSaving] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const fetchCards = useCallback(async () => {
    setCardsState({ status: 'loading' });
    try {
      const fn = httpsCallable<
        GetSquareCardCandidatesRequest,
        GetSquareCardCandidatesResponse
      >(getMapleFunctions(), 'getSquareCardCandidates');
      const result = await fn({});
      setCardsState({
        status: 'success',
        data: {
          cards: result.data.cards ?? [],
          linkedTo: result.data.linkedTo ?? {},
        },
      });
    } catch (error) {
      setCardsState({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Could not read the cards on file in Square',
      });
    }
  }, []);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  /** Attach a card, or pass null to detach. Returns the updated student. */
  const setStudentCard = useCallback(
    async (
      studentId: string,
      squareCardId: string | null
    ): Promise<Student | undefined> => {
      setIsSaving(true);
      setLinkError(null);
      try {
        const fn = httpsCallable<
          UpdateStudentSquareCardRequest,
          UpdateStudentSquareCardResponse
        >(getMapleFunctions(), 'updateStudentSquareCard');
        const result = await fn({ studentId, squareCardId });
        // Refresh so "already linked to" is right for the next student.
        await fetchCards();
        return result.data.student;
      } catch (error) {
        setLinkError(
          error instanceof Error ? error.message : 'Could not link that card'
        );
        return undefined;
      } finally {
        setIsSaving(false);
      }
    },
    [fetchCards]
  );

  return { cardsState, isSaving, linkError, setStudentCard, refetch: fetchCards };
}
