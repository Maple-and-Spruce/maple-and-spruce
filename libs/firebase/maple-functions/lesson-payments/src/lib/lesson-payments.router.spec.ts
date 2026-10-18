import { describe, it, expect, vi } from 'vitest';

/**
 * The lessonPayments router's wiring. Two of these routes move money, so the
 * gate and the credentials each route asks for are pinned exactly: admin-only,
 * with the Square access token and strings and nothing else. The handlers keep
 * their own tests (charge-lessons-now.logic.spec.ts) and the integration suites
 * charge against the Square mock.
 */

vi.mock('@maple/firebase/functions', () => {
  // A fresh builder per route that records what the chain asked for.
  function builder() {
    const route = {
      roles: undefined as unknown,
      secrets: [] as string[],
      strings: [] as string[],
    };
    const chain = {
      requiringRole: (roles: unknown) => {
        route.roles = roles;
        return chain;
      },
      usingSecrets: (...names: string[]) => {
        route.secrets.push(...names);
        return chain;
      },
      usingStrings: (...names: string[]) => {
        route.strings.push(...names);
        return chain;
      },
      asRoute: (handler: unknown) => ({ ...route, handler }),
    };
    return chain;
  }
  return {
    Functions: {
      get endpoint() {
        return builder();
      },
      router: (_name: string, routes: unknown) => routes,
    },
    Role: { Admin: 'admin' },
  };
});

vi.mock('@maple/firebase/square', () => ({
  SQUARE_SECRET_NAMES: ['SQUARE_ACCESS_TOKEN'],
  SQUARE_STRING_NAMES: ['SQUARE_LOCATION_ID', 'SQUARE_ENVIRONMENT'],
}));

vi.mock('./charge-lessons-now', () => ({ chargeLessonsNow: vi.fn() }));
vi.mock('./trigger-lesson-billing', () => ({ triggerLessonBilling: vi.fn() }));
vi.mock('./get-square-card-candidates', () => ({
  getSquareCardCandidates: vi.fn(),
}));
vi.mock('./update-student-square-card', () => ({
  updateStudentSquareCard: vi.fn(),
}));

import { lessonPayments } from './lesson-payments.router';
import { chargeLessonsNow } from './charge-lessons-now';
import { triggerLessonBilling } from './trigger-lesson-billing';
import { getSquareCardCandidates } from './get-square-card-candidates';
import { updateStudentSquareCard } from './update-student-square-card';

type Route = {
  roles: unknown;
  secrets: string[];
  strings: string[];
  handler: unknown;
};
const routes = lessonPayments as unknown as Record<string, Route>;

const handlers: Record<string, unknown> = {
  chargeLessonsNow,
  triggerLessonBilling,
  getSquareCardCandidates,
  updateStudentSquareCard,
};

describe('lessonPayments router', () => {
  it('has exactly these four routes', () => {
    expect(Object.keys(routes).sort()).toEqual(Object.keys(handlers).sort());
  });

  it.each(Object.keys(handlers))(
    '%s: admin-only, with the Square credentials and no others',
    (name) => {
      expect(routes[name].roles).toBe('admin');
      expect(routes[name].secrets).toEqual(['SQUARE_ACCESS_TOKEN']);
      expect(routes[name].strings).toEqual([
        'SQUARE_LOCATION_ID',
        'SQUARE_ENVIRONMENT',
      ]);
    },
  );

  it('serves each route from its own handler', () => {
    for (const [name, route] of Object.entries(routes)) {
      expect(route.handler, name).toBe(handlers[name]);
    }
  });
});
