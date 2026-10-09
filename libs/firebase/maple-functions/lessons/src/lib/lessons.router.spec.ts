import { describe, it, expect, vi } from 'vitest';

/**
 * The lessons router's wiring: every route present, gated exactly as it was as
 * a standalone function, and served by its own handler. The handlers keep their
 * own specs; the real gates are checked against the emulator in the role matrix
 * and the lesson suites.
 */

vi.mock('@maple/firebase/functions', () => {
  const chain = (validator?: unknown) => ({
    requiringRole: (roles: unknown) => ({
      validating: (v: unknown) => chain(v).requiringRole(roles),
      asRoute: (handler: unknown) => ({ roles, validator, handler }),
    }),
  });
  return {
    Functions: {
      endpoint: chain(),
      router: (_name: string, routes: unknown) => routes,
    },
    Role: { Admin: 'admin', LessonTeacher: 'lesson-teacher' },
  };
});

vi.mock('@maple/ts/validation', () => ({
  lessonBlockValidation: 'lessonBlockValidation',
}));

vi.mock('./get-lessons', () => ({ getLessons: vi.fn() }));
vi.mock('./create-lesson', () => ({ createLesson: vi.fn() }));
vi.mock('./create-lesson-series', () => ({ createLessonSeries: vi.fn() }));
vi.mock('./update-lesson', () => ({ updateLesson: vi.fn() }));
vi.mock('./delete-lesson', () => ({ deleteLesson: vi.fn() }));
vi.mock('./get-lesson-blocks', () => ({ getLessonBlocks: vi.fn() }));
vi.mock('./get-student-lesson-schedules', () => ({
  getStudentLessonSchedules: vi.fn(),
}));
vi.mock('./create-student-lesson-schedule', () => ({
  createStudentLessonSchedule: vi.fn(),
}));
vi.mock('./update-student-lesson-schedule', () => ({
  updateStudentLessonSchedule: vi.fn(),
}));
vi.mock('./get-my-day-lessons', () => ({ getMyDayLessons: vi.fn() }));
vi.mock('./get-my-week', () => ({ getMyWeek: vi.fn() }));
vi.mock('./create-lesson-block', () => ({ createLessonBlock: vi.fn() }));
vi.mock('./update-lesson-block', () => ({ updateLessonBlock: vi.fn() }));
vi.mock('./delete-lesson-block', () => ({ deleteLessonBlock: vi.fn() }));
vi.mock('./get-lesson-inquiries', () => ({ getLessonInquiries: vi.fn() }));
vi.mock('./update-lesson-inquiry-status', () => ({
  updateLessonInquiryStatus: vi.fn(),
}));
vi.mock('./get-lesson-billing', () => ({ getLessonBilling: vi.fn() }));
vi.mock('./save-lesson-billing-rule', () => ({
  saveLessonBillingRule: vi.fn(),
}));
vi.mock('./update-lesson-scheduled-charge', () => ({
  updateLessonScheduledCharge: vi.fn(),
}));
vi.mock('./get-pos-lesson-attributions', () => ({
  getPosLessonAttributions: vi.fn(),
}));
vi.mock('./get-pos-lesson-attribution-summary', () => ({
  getPosLessonAttributionSummary: vi.fn(),
}));
vi.mock('./resolve-pos-lesson-attribution', () => ({
  resolvePosLessonAttribution: vi.fn(),
}));

import { lessons } from './lessons.router';
import { getLessons } from './get-lessons';
import { createLesson } from './create-lesson';
import { createLessonSeries } from './create-lesson-series';
import { updateLesson } from './update-lesson';
import { deleteLesson } from './delete-lesson';
import { getLessonBlocks } from './get-lesson-blocks';
import { getStudentLessonSchedules } from './get-student-lesson-schedules';
import { createStudentLessonSchedule } from './create-student-lesson-schedule';
import { updateStudentLessonSchedule } from './update-student-lesson-schedule';
import { getMyDayLessons } from './get-my-day-lessons';
import { getMyWeek } from './get-my-week';
import { createLessonBlock } from './create-lesson-block';
import { updateLessonBlock } from './update-lesson-block';
import { deleteLessonBlock } from './delete-lesson-block';
import { getLessonInquiries } from './get-lesson-inquiries';
import { updateLessonInquiryStatus } from './update-lesson-inquiry-status';
import { getLessonBilling } from './get-lesson-billing';
import { saveLessonBillingRule } from './save-lesson-billing-rule';
import { updateLessonScheduledCharge } from './update-lesson-scheduled-charge';
import { getPosLessonAttributions } from './get-pos-lesson-attributions';
import { getPosLessonAttributionSummary } from './get-pos-lesson-attribution-summary';
import { resolvePosLessonAttribution } from './resolve-pos-lesson-attribution';

type Route = { roles: unknown; validator?: unknown; handler: unknown };
const routes = lessons as unknown as Record<string, Route>;

const handlers: Record<string, unknown> = {
  getLessons,
  createLesson,
  createLessonSeries,
  updateLesson,
  deleteLesson,
  getLessonBlocks,
  getStudentLessonSchedules,
  createStudentLessonSchedule,
  updateStudentLessonSchedule,
  getMyDayLessons,
  getMyWeek,
  createLessonBlock,
  updateLessonBlock,
  deleteLessonBlock,
  getLessonInquiries,
  updateLessonInquiryStatus,
  getLessonBilling,
  saveLessonBillingRule,
  updateLessonScheduledCharge,
  getPosLessonAttributions,
  getPosLessonAttributionSummary,
  resolvePosLessonAttribution,
};

/** Lessons, weekly times and a teacher's own day: a lesson teacher works their own. */
const ADMIN_OR_LESSON_TEACHER = [
  'getLessons',
  'createLesson',
  'createLessonSeries',
  'updateLesson',
  'deleteLesson',
  'getLessonBlocks',
  'getStudentLessonSchedules',
  'createStudentLessonSchedule',
  'updateStudentLessonSchedule',
  'getMyDayLessons',
  'getMyWeek',
];

/** Blocks, inquiries, billing and POS attribution are run by the studio. */
const ADMIN_ONLY = [
  'createLessonBlock',
  'updateLessonBlock',
  'deleteLessonBlock',
  'getLessonInquiries',
  'updateLessonInquiryStatus',
  'getLessonBilling',
  'saveLessonBillingRule',
  'updateLessonScheduledCharge',
  'getPosLessonAttributions',
  'getPosLessonAttributionSummary',
  'resolvePosLessonAttribution',
];

describe('lessons router', () => {
  it('has exactly these routes', () => {
    expect(Object.keys(routes).sort()).toEqual(
      [...ADMIN_OR_LESSON_TEACHER, ...ADMIN_ONLY].sort(),
    );
  });

  it.each(ADMIN_OR_LESSON_TEACHER)('%s: admins and lesson teachers', (name) => {
    expect(routes[name].roles).toEqual(['admin', 'lesson-teacher']);
  });

  it.each(ADMIN_ONLY)('%s: admins only', (name) => {
    expect(routes[name].roles).toBe('admin');
  });

  it('validates a new lesson block before it is created', () => {
    expect(routes['createLessonBlock'].validator).toBe('lessonBlockValidation');
    const validated = Object.entries(routes).filter(([, r]) => r.validator);
    expect(validated.map(([name]) => name)).toEqual(['createLessonBlock']);
  });

  it('serves each route from its own handler', () => {
    for (const [name, route] of Object.entries(routes)) {
      expect(route.handler, name).toBe(handlers[name]);
    }
  });
});
