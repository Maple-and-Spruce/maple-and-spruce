/**
 * settings — app-level lists the studio edits on Settings, as one Cloud
 * Function (ADR-029).
 *
 * Starts with the instruments the studio teaches (#161). The singleton
 * app-config pairs (lesson rates, the studio Venmo handle, the POS lesson
 * catalog ids) joined as routes (#156), each keeping its old function's name
 * and gate, rather than as a get/update function pair each.
 *
 * Each route spells its gate out in full: `tools/check-callable-roles.ts` reads
 * `requiringRole` off the AST and cannot see through a helper.
 */
import {
  Functions,
  Role,
  throwInvalidArgument,
} from '@maple/firebase/functions';
import {
  BusinessPaymentConfigRepository,
  InstrumentsConfigRepository,
  LessonRatesConfigRepository,
  PosLessonConfigRepository,
} from '@maple/firebase/database';
import { instrumentListProblem, LESSON_LENGTHS } from '@maple/ts/domain';
import type { LessonRateByLength } from '@maple/ts/domain';
import type {
  GetBusinessPaymentConfigRequest,
  GetBusinessPaymentConfigResponse,
  GetInstrumentsRequest,
  GetInstrumentsResponse,
  GetLessonRatesConfigRequest,
  GetLessonRatesConfigResponse,
  GetPosLessonConfigRequest,
  GetPosLessonConfigResponse,
  SaveInstrumentsRequest,
  SaveInstrumentsResponse,
  UpdateBusinessPaymentConfigRequest,
  UpdateBusinessPaymentConfigResponse,
  UpdateLessonRatesConfigRequest,
  UpdateLessonRatesConfigResponse,
  UpdatePosLessonConfigRequest,
  UpdatePosLessonConfigResponse,
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

  /** The default private-pay lesson rates by length (legacy #629). */
  getLessonRatesConfig: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<GetLessonRatesConfigRequest, GetLessonRatesConfigResponse>(
      async () => {
        const config = await LessonRatesConfigRepository.get();
        return { config };
      }
    ),

  /**
   * Drops non-positive / non-integer entries so a bad value never prices an
   * auto-invoice.
   */
  updateLessonRatesConfig: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<UpdateLessonRatesConfigRequest, UpdateLessonRatesConfigResponse>(
      async (data, context) => {
        if (!data?.rateByLength || typeof data.rateByLength !== 'object') {
          throwInvalidArgument('rateByLength must be an object');
        }

        const cleaned: LessonRateByLength = {};
        for (const length of LESSON_LENGTHS) {
          const cents = data.rateByLength[length];
          if (
            typeof cents === 'number' &&
            Number.isInteger(cents) &&
            cents > 0
          ) {
            cleaned[length] = cents;
          }
        }

        const config = await LessonRatesConfigRepository.setRateByLength(
          cleaned,
          context.uid
        );
        return { config };
      }
    ),

  /**
   * The studio Venmo handle (legacy #631). Teachers get the handle via
   * getMyDayLessons, so this stays admin-only.
   */
  getBusinessPaymentConfig: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<GetBusinessPaymentConfigRequest, GetBusinessPaymentConfigResponse>(
      async () => {
        const config = await BusinessPaymentConfigRepository.get();
        return { config };
      }
    ),

  /** Stored without a leading @. An empty value clears it. */
  updateBusinessPaymentConfig: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<
      UpdateBusinessPaymentConfigRequest,
      UpdateBusinessPaymentConfigResponse
    >(async (data, context) => {
      const raw = (data?.venmoHandle ?? '').trim().replace(/^@/, '');
      if (raw && !/^[A-Za-z0-9_-]{5,30}$/.test(raw)) {
        throwInvalidArgument(
          'Venmo handle must be 5–30 characters (letters, numbers, hyphens, underscores)'
        );
      }
      const config = await BusinessPaymentConfigRepository.setVenmoHandle(
        raw || undefined,
        context.uid
      );
      return { config };
    }),

  /** The Square catalog object ids that count as music lessons at the POS (legacy #628). */
  getPosLessonConfig: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<GetPosLessonConfigRequest, GetPosLessonConfigResponse>(
      async () => {
        const config = await PosLessonConfigRepository.get();
        return { config };
      }
    ),

  /** De-dupes and trims the ids; stamps the editor uid. */
  updatePosLessonConfig: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<UpdatePosLessonConfigRequest, UpdatePosLessonConfigResponse>(
      async (data, context) => {
        if (!Array.isArray(data?.lessonCatalogObjectIds)) {
          throwInvalidArgument('lessonCatalogObjectIds must be an array');
        }

        const cleaned = [
          ...new Set(
            data.lessonCatalogObjectIds
              .map((id) => (typeof id === 'string' ? id.trim() : ''))
              .filter((id) => id.length > 0)
          ),
        ];

        const config =
          await PosLessonConfigRepository.setLessonCatalogObjectIds(
            cleaned,
            context.uid
          );
        return { config };
      }
    ),
});
