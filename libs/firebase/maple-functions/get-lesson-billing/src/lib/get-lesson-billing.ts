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
  InstructorRepository,
  LessonBillingRuleRepository,
  LessonRatesConfigRepository,
  LessonScheduledChargeRepository,
  StudentRepository,
} from '@maple/firebase/database';
import { effectiveRateByLength } from '@maple/ts/domain';
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

    // For one student, the table is theirs: their primary teacher's rates for
    // their instrument over the studio default. That is what chargeLessonsNow
    // prices from, and every screen that prices this student's lessons reads
    // it from here. Studio-wide, there is no one teacher, so it stays the
    // studio default.
    if (!data?.studentId) {
      return { rules, charges, rateByLength: rates.rateByLength };
    }
    const student = await StudentRepository.findById(data.studentId);
    const primaryTeacher = student?.primaryTeacherId
      ? await InstructorRepository.findById(student.primaryTeacherId)
      : undefined;
    return {
      rules,
      charges,
      rateByLength: student
        ? effectiveRateByLength(student, primaryTeacher, rates.rateByLength)
        : rates.rateByLength,
    };
  });
