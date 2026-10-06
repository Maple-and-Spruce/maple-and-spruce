/**
 * settings — app-level lists the studio edits on Settings, as one Cloud
 * Function (ADR-029).
 *
 * Starts with the instruments the studio teaches (#161). Other singleton
 * settings can join as routes rather than as a get/update function pair each.
 *
 * Each route spells its gate out in full: `tools/check-callable-roles.ts` reads
 * `requiringRole` off the AST and cannot see through a helper.
 */
import {
  Functions,
  Role,
  throwInvalidArgument,
} from '@maple/firebase/functions';
import { InstrumentsConfigRepository } from '@maple/firebase/database';
import { instrumentListProblem } from '@maple/ts/domain';
import type {
  GetInstrumentsRequest,
  GetInstrumentsResponse,
  SaveInstrumentsRequest,
  SaveInstrumentsResponse,
} from '@maple/ts/firebase/api-types';

export const settings = Functions.router('settings', {
  /** Read by anyone who adds or edits a student, teachers included. */
  getInstruments: Functions.endpoint
    .requiringRole([Role.Admin, Role.LessonTeacher])
    .asRoute<GetInstrumentsRequest, GetInstrumentsResponse>(async () => {
      const { instruments } = await InstrumentsConfigRepository.get();
      return { instruments };
    }),

  /**
   * Replace the list. Students and instructor rates on an instrument that is
   * dropped keep it — retiring an instrument only stops it being offered.
   */
  saveInstruments: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<SaveInstrumentsRequest, SaveInstrumentsResponse>(
      async (data, context) => {
        const instruments = (data?.instruments ?? []).map((o) => ({
          key: String(o?.key ?? ''),
          label: String(o?.label ?? '').trim(),
        }));
        const problem = instrumentListProblem(instruments);
        if (problem) throwInvalidArgument(problem);
        const saved = await InstrumentsConfigRepository.setInstruments(
          instruments,
          context?.uid
        );
        return { instruments: saved.instruments };
      }
    ),
});
