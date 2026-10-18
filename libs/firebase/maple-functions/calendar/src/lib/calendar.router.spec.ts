import { describe, it, expect, vi } from 'vitest';

/**
 * The calendar router's wiring: every route present, gated exactly as it was
 * as a standalone function, and served by its own handler. The gates differ
 * by route on purpose (lesson teachers may book a room but not edit events),
 * so each is pinned. The real gates are checked against the emulator in the
 * role matrix and the calendar suite.
 */

vi.mock('@maple/firebase/functions', () => ({
  Functions: {
    endpoint: {
      requiringRole: (roles: unknown) => ({
        asRoute: (handler: unknown) => ({ roles, handler }),
      }),
    },
    router: (_name: string, routes: unknown) => routes,
  },
  Role: {
    Admin: 'admin',
    MtTeacher: 'mt-teacher',
    Clerk: 'clerk',
    LessonTeacher: 'lesson-teacher',
  },
}));

vi.mock('./get-calendar-events', () => ({ getCalendarEvents: vi.fn() }));
vi.mock('./get-calendar-event', () => ({ getCalendarEvent: vi.fn() }));
vi.mock('./create-calendar-event', () => ({ createCalendarEvent: vi.fn() }));
vi.mock('./get-room-schedule', () => ({ getRoomSchedule: vi.fn() }));
vi.mock('./update-calendar-event', () => ({ updateCalendarEvent: vi.fn() }));
vi.mock('./delete-calendar-event', () => ({ deleteCalendarEvent: vi.fn() }));
vi.mock('./get-calendar-embed-config', () => ({
  getCalendarEmbedConfig: vi.fn(),
}));
vi.mock('./update-calendar-embed-config', () => ({
  updateCalendarEmbedConfig: vi.fn(),
}));
vi.mock('./add-calendar-embed-source', () => ({
  addCalendarEmbedSource: vi.fn(),
}));
vi.mock('./remove-calendar-embed-source', () => ({
  removeCalendarEmbedSource: vi.fn(),
}));

import { calendar } from './calendar.router';
import { getCalendarEvents } from './get-calendar-events';
import { getCalendarEvent } from './get-calendar-event';
import { createCalendarEvent } from './create-calendar-event';
import { getRoomSchedule } from './get-room-schedule';
import { updateCalendarEvent } from './update-calendar-event';
import { deleteCalendarEvent } from './delete-calendar-event';
import { getCalendarEmbedConfig } from './get-calendar-embed-config';
import { updateCalendarEmbedConfig } from './update-calendar-embed-config';
import { addCalendarEmbedSource } from './add-calendar-embed-source';
import { removeCalendarEmbedSource } from './remove-calendar-embed-source';

type Route = { roles: unknown; handler: unknown };
const routes = calendar as unknown as Record<string, Route>;

const handlers: Record<string, unknown> = {
  getCalendarEvents,
  getCalendarEvent,
  createCalendarEvent,
  getRoomSchedule,
  updateCalendarEvent,
  deleteCalendarEvent,
  getCalendarEmbedConfig,
  updateCalendarEmbedConfig,
  addCalendarEmbedSource,
  removeCalendarEmbedSource,
};

/** Every staff role reads the calendar and the room schedule, and can book. */
const EVERY_STAFF_ROLE = [
  'getCalendarEvents',
  'getCalendarEvent',
  'createCalendarEvent',
  'getRoomSchedule',
];
/** Editing and deleting an event excludes lesson teachers. */
const EXCEPT_LESSON_TEACHERS = ['updateCalendarEvent', 'deleteCalendarEvent'];
/** The embed configuration behind /calendar/embed is admin-only. */
const ADMIN_ONLY = [
  'getCalendarEmbedConfig',
  'updateCalendarEmbedConfig',
  'addCalendarEmbedSource',
  'removeCalendarEmbedSource',
];

describe('calendar router', () => {
  it('has exactly these routes', () => {
    expect(Object.keys(routes).sort()).toEqual(
      [...EVERY_STAFF_ROLE, ...EXCEPT_LESSON_TEACHERS, ...ADMIN_ONLY].sort(),
    );
  });

  it.each(EVERY_STAFF_ROLE)('%s: every staff role', (name) => {
    expect(routes[name].roles).toEqual([
      'admin',
      'mt-teacher',
      'clerk',
      'lesson-teacher',
    ]);
  });

  it.each(EXCEPT_LESSON_TEACHERS)('%s: not lesson teachers', (name) => {
    expect(routes[name].roles).toEqual(['admin', 'mt-teacher', 'clerk']);
  });

  it.each(ADMIN_ONLY)('%s: admins only', (name) => {
    expect(routes[name].roles).toBe('admin');
  });

  it('serves each route from its own handler', () => {
    for (const [name, route] of Object.entries(routes)) {
      expect(route.handler, name).toBe(handlers[name]);
    }
  });
});
