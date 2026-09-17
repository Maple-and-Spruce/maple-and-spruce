/**
 * Linking a Square card on file to a student (#81).
 */
import type { SquareCardOnFile, Student } from '@maple/ts/domain';

export type GetSquareCardCandidatesRequest = Record<string, never>;

export interface GetSquareCardCandidatesResponse {
  /** Every enabled card on file, with enough of its customer to match it. */
  cards: SquareCardOnFile[];
  /**
   * Cards already attached to a student, keyed by card id — so the UI can say
   * whose it is rather than offering one family's card to another student.
   */
  linkedTo: Record<string, { id: string; name: string }>;
}

export interface UpdateStudentSquareCardRequest {
  studentId: string;
  /** The card to attach. Null or absent detaches whatever is linked. */
  squareCardId?: string | null;
}

export interface UpdateStudentSquareCardResponse {
  student: Student;
}
