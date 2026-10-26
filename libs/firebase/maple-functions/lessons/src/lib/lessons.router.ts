/**
 * lessons — music lessons, as one Cloud Function (ADR-029, #67).
 *
 * Every route keeps the gate it had as a standalone function. Lesson routes
 * are `[Admin, LessonTeacher]`, with a lesson teacher narrowed to their own
 * lessons and students inside each handler; blocks, inquiries, billing,
 * POS attribution and the Home dashboard's studio day and inbox are
 * admin-only.
 *
 * Deliberately not here:
 * - Charging (`chargeLessonsNow`, `triggerLessonBilling`) and Square card
 *   linking are on the `lessonPayments` router in `maple-square`: they need
 *   Square secrets, a router is per codebase, and a route's secrets are
 *   granted to every route on it.
 * - `triggerLessonInquirySync` holds the Tally API key, for the same reason.
 * - Schedules and triggers (`syncLessonInquiries`, `runLessonBilling`,
 *   `onLessonWrite`) can't be routes.
 * - Invoices (#72) and the room schedule (#73) belong to other domains.
 *
 * Each route spells its gate out in full: `tools/check-callable-roles.ts` reads
 * `requiringRole` off the AST and cannot see through a helper.
 */
import { Functions, Role } from '@maple/firebase/functions';
import {
  inboxDismissalValidation,
  lessonBlockValidation,
} from '@maple/ts/validation';
import type {
  CreateLessonBlockRequest,
  CreateLessonBlockResponse,
  CreateLessonRequest,
  CreateLessonResponse,
  CreateLessonSeriesRequest,
  CreateLessonSeriesResponse,
  CreateStudentLessonScheduleRequest,
  CreateStudentLessonScheduleResponse,
  DismissInboxItemRequest,
  DismissInboxItemResponse,
  DeleteLessonBlockRequest,
  DeleteLessonBlockResponse,
  DeleteLessonRequest,
  DeleteLessonResponse,
  GetInboxRequest,
  GetInboxResponse,
  GetLessonBillingRequest,
  GetLessonBillingResponse,
  GetLessonBlocksRequest,
  GetLessonBlocksResponse,
  GetLessonInquiriesRequest,
  GetLessonInquiriesResponse,
  GetLessonsRequest,
  GetLessonsResponse,
  GetMyDayLessonsRequest,
  GetMyDayLessonsResponse,
  GetMyWeekRequest,
  GetMyWeekResponse,
  GetPosLessonAttributionSummaryRequest,
  GetPosLessonAttributionSummaryResponse,
  GetPosLessonAttributionsRequest,
  GetPosLessonAttributionsResponse,
  GetStudentLessonSchedulesRequest,
  GetStudentLessonSchedulesResponse,
  GetStudioDayRequest,
  GetStudioDayResponse,
  PushLessonsBackRequest,
  PushLessonsBackResponse,
  RescheduleLessonWithCreditRequest,
  RescheduleLessonWithCreditResponse,
  ResolvePosLessonAttributionRequest,
  ResolvePosLessonAttributionResponse,
  SaveLessonBillingRuleRequest,
  SaveLessonBillingRuleResponse,
  UpdateLessonBlockRequest,
  UpdateLessonBlockResponse,
  UpdateLessonInquiryStatusRequest,
  UpdateLessonInquiryStatusResponse,
  UpdateLessonRequest,
  UpdateLessonResponse,
  UpdateLessonScheduledChargeRequest,
  UpdateLessonScheduledChargeResponse,
  UpdateStudentLessonScheduleRequest,
  UpdateStudentLessonScheduleResponse,
} from '@maple/ts/firebase/api-types';
import { getLessons } from './get-lessons';
import { createLesson } from './create-lesson';
import { createLessonSeries } from './create-lesson-series';
import { updateLesson } from './update-lesson';
import { deleteLesson } from './delete-lesson';
import { rescheduleLessonWithCredit } from './reschedule-lesson-with-credit';
import { pushLessonsBack } from './push-lessons-back';
import { getLessonBlocks } from './get-lesson-blocks';
import { createLessonBlock } from './create-lesson-block';
import { updateLessonBlock } from './update-lesson-block';
import { deleteLessonBlock } from './delete-lesson-block';
import { getStudentLessonSchedules } from './get-student-lesson-schedules';
import { createStudentLessonSchedule } from './create-student-lesson-schedule';
import { updateStudentLessonSchedule } from './update-student-lesson-schedule';
import { getMyDayLessons } from './get-my-day-lessons';
import { getMyWeek } from './get-my-week';
import { getStudioDay } from './get-studio-day';
import { getInbox } from './get-inbox';
import { dismissInboxItem } from './dismiss-inbox-item';
import { getLessonInquiries } from './get-lesson-inquiries';
import { updateLessonInquiryStatus } from './update-lesson-inquiry-status';
import { getLessonBilling } from './get-lesson-billing';
import { saveLessonBillingRule } from './save-lesson-billing-rule';
import { updateLessonScheduledCharge } from './update-lesson-scheduled-charge';
import { getPosLessonAttributions } from './get-pos-lesson-attributions';
import { getPosLessonAttributionSummary } from './get-pos-lesson-attribution-summary';
import { resolvePosLessonAttribution } from './resolve-pos-lesson-attribution';

export const lessons = Functions.router('lessons', {
  // Lessons
  getLessons: Functions.endpoint
    .requiringRole([Role.Admin, Role.LessonTeacher])
    .asRoute<GetLessonsRequest, GetLessonsResponse>(getLessons),

  createLesson: Functions.endpoint
    .requiringRole([Role.Admin, Role.LessonTeacher])
    .asRoute<CreateLessonRequest, CreateLessonResponse>(createLesson),

  createLessonSeries: Functions.endpoint
    .requiringRole([Role.Admin, Role.LessonTeacher])
    .asRoute<CreateLessonSeriesRequest, CreateLessonSeriesResponse>(
      createLessonSeries,
    ),

  updateLesson: Functions.endpoint
    .requiringRole([Role.Admin, Role.LessonTeacher])
    .asRoute<UpdateLessonRequest, UpdateLessonResponse>(updateLesson),

  deleteLesson: Functions.endpoint
    .requiringRole([Role.Admin, Role.LessonTeacher])
    .asRoute<DeleteLessonRequest, DeleteLessonResponse>(deleteLesson),

  // Cancel a lesson and book its replacement, moving its payment over (#209)
  rescheduleLessonWithCredit: Functions.endpoint
    .requiringRole([Role.Admin, Role.LessonTeacher])
    .asRoute<
      RescheduleLessonWithCreditRequest,
      RescheduleLessonWithCreditResponse
    >(rescheduleLessonWithCredit),

  // Push a lesson and every later one back a week, together
  pushLessonsBack: Functions.endpoint
    .requiringRole([Role.Admin, Role.LessonTeacher])
    .asRoute<PushLessonsBackRequest, PushLessonsBackResponse>(pushLessonsBack),

  // Lesson blocks: the teaching windows lessons must fall inside
  getLessonBlocks: Functions.endpoint
    .requiringRole([Role.Admin, Role.LessonTeacher])
    .asRoute<GetLessonBlocksRequest, GetLessonBlocksResponse>(getLessonBlocks),

  createLessonBlock: Functions.endpoint
    .requiringRole(Role.Admin)
    .validating(lessonBlockValidation)
    .asRoute<CreateLessonBlockRequest, CreateLessonBlockResponse>(
      createLessonBlock,
    ),

  updateLessonBlock: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<UpdateLessonBlockRequest, UpdateLessonBlockResponse>(
      updateLessonBlock,
    ),

  deleteLessonBlock: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<DeleteLessonBlockRequest, DeleteLessonBlockResponse>(
      deleteLessonBlock,
    ),

  // Weekly times: planning notes that book nothing (ADR-034)
  getStudentLessonSchedules: Functions.endpoint
    .requiringRole([Role.Admin, Role.LessonTeacher])
    .asRoute<
      GetStudentLessonSchedulesRequest,
      GetStudentLessonSchedulesResponse
    >(getStudentLessonSchedules),

  createStudentLessonSchedule: Functions.endpoint
    .requiringRole([Role.Admin, Role.LessonTeacher])
    .asRoute<
      CreateStudentLessonScheduleRequest,
      CreateStudentLessonScheduleResponse
    >(createStudentLessonSchedule),

  updateStudentLessonSchedule: Functions.endpoint
    .requiringRole([Role.Admin, Role.LessonTeacher])
    .asRoute<
      UpdateStudentLessonScheduleRequest,
      UpdateStudentLessonScheduleResponse
    >(updateStudentLessonSchedule),

  // A teacher's own day and week
  getMyDayLessons: Functions.endpoint
    .requiringRole([Role.Admin, Role.LessonTeacher])
    .asRoute<GetMyDayLessonsRequest, GetMyDayLessonsResponse>(getMyDayLessons),

  getMyWeek: Functions.endpoint
    .requiringRole([Role.Admin, Role.LessonTeacher])
    .asRoute<GetMyWeekRequest, GetMyWeekResponse>(getMyWeek),

  // The whole studio's day, every teacher, for the admin Home dashboard (#235)
  getStudioDay: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<GetStudioDayRequest, GetStudioDayResponse>(getStudioDay),

  // The studio-wide inbox on the admin Home, and "Mark done" (#235). Here
  // rather than its own function: the Home page already calls getStudioDay,
  // so the inbox lands on the same warm instance.
  getInbox: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<GetInboxRequest, GetInboxResponse>(getInbox),

  dismissInboxItem: Functions.endpoint
    .requiringRole(Role.Admin)
    .validating(inboxDismissalValidation)
    .asRoute<DismissInboxItemRequest, DismissInboxItemResponse>(
      dismissInboxItem,
    ),

  // Lesson inquiries (leads from the Tally form)
  getLessonInquiries: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<GetLessonInquiriesRequest, GetLessonInquiriesResponse>(
      getLessonInquiries,
    ),

  updateLessonInquiryStatus: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<
      UpdateLessonInquiryStatusRequest,
      UpdateLessonInquiryStatusResponse
    >(updateLessonInquiryStatus),

  // Billing rules and scheduled charges. Charging itself is on the maple-square side.
  getLessonBilling: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<GetLessonBillingRequest, GetLessonBillingResponse>(
      getLessonBilling,
    ),

  saveLessonBillingRule: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<SaveLessonBillingRuleRequest, SaveLessonBillingRuleResponse>(
      saveLessonBillingRule,
    ),

  updateLessonScheduledCharge: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<
      UpdateLessonScheduledChargeRequest,
      UpdateLessonScheduledChargeResponse
    >(updateLessonScheduledCharge),

  // POS lesson attribution
  getPosLessonAttributions: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<GetPosLessonAttributionsRequest, GetPosLessonAttributionsResponse>(
      getPosLessonAttributions,
    ),

  getPosLessonAttributionSummary: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<
      GetPosLessonAttributionSummaryRequest,
      GetPosLessonAttributionSummaryResponse
    >(getPosLessonAttributionSummary),

  resolvePosLessonAttribution: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<
      ResolvePosLessonAttributionRequest,
      ResolvePosLessonAttributionResponse
    >(resolvePosLessonAttribution),
});
