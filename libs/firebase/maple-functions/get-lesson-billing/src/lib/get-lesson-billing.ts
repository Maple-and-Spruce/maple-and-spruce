/**
 * getLessonBilling (#81) — everything the billing screen shows, in one read.
 *
 * Rules and charges are fetched together rather than as two callables because
 * the screen is meaningless with only one of them: a charge is unreadable
 * without the rule that produced it. One call is also one cold start instead of
 * two, and one fewer Cloud Run service against the ADR-029 budget.
 */
import { Functions, Role } from '@maple/firebase/functions';
import {
  LessonBillingRuleRepository,
  LessonRatesConfigRepository,
  LessonScheduledChargeRepository,
} from '@maple/firebase/database';
import type {
  GetLessonBillingRequest,
  GetLessonBillingResponse,
} from '@maple/ts/firebase/api-types';

export const getLessonBilling = Functions.endpoint
  .requiringRole(Role.Admin)
  .handle<GetLessonBillingRequest, GetLessonBillingResponse>(async (data) => {
    const [rules, charges, rates] = await Promise.all([
      LessonBillingRuleRepository.findAll(),
      LessonScheduledChargeRepository.findAll({ studentId: data?.studentId }),
      // The rate table rides along so the screen can price a prepayment from
      // the same numbers the server will charge from (legacy #864).
      LessonRatesConfigRepository.get(),
    ]);
    return { rules, charges, rateByLength: rates.rateByLength };
  });
