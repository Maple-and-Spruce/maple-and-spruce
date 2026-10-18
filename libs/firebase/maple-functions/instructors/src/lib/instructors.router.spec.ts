import { describe, it, expect, vi } from 'vitest';

/**
 * The instructors router's wiring: every route present, gated as it was as a
 * standalone function, and served by its handler. The handlers have their own
 * specs; the real gates are checked against the emulator in the role matrix.
 */

const mocks = vi.hoisted(() => ({ validators: [] as unknown[], unique: [] as unknown[] }));

vi.mock('@maple/firebase/functions', () => {
  const builder = (roles: unknown) => {
    const chain = {
      validating: (v: unknown) => {
        mocks.validators.push(v);
        return chain;
      },
      ensuringUnique: (u: unknown) => {
        mocks.unique.push(u);
        return chain;
      },
      asRoute: (handler: unknown) => ({ roles, handler }),
    };
    return chain;
  };
  return {
    Functions: {
      endpoint: { requiringRole: builder },
      router: (_name: string, routes: unknown) => routes,
    },
    Role: { Admin: 'admin', LessonTeacher: 'lesson-teacher' },
  };
});

vi.mock('./instructors', () => ({
  getInstructors: vi.fn(),
  getInstructor: vi.fn(),
  createInstructor: vi.fn(),
  updateInstructor: vi.fn(),
  deleteInstructor: vi.fn(),
  createInstructorEmailUniqueness: { field: 'email' },
}));

vi.mock('./upload-instructor-image', () => ({
  uploadInstructorImage: vi.fn(),
}));

import { instructorValidation } from '@maple/ts/validation';
import { instructors } from './instructors.router';
import * as handlers from './instructors';
import { uploadInstructorImage } from './upload-instructor-image';

type Route = { roles: unknown; handler: unknown };
const routes = instructors as unknown as Record<string, Route>;

describe('instructors router', () => {
  it('has exactly the six routes the six functions provided', () => {
    expect(Object.keys(routes).sort()).toEqual([
      'createInstructor',
      'deleteInstructor',
      'getInstructor',
      'getInstructors',
      'updateInstructor',
      'uploadInstructorImage',
    ]);
  });

  it('serves reads to admins and lesson teachers', () => {
    for (const name of ['getInstructors', 'getInstructor'] as const) {
      expect(routes[name].roles, name).toEqual(['admin', 'lesson-teacher']);
      expect(routes[name].handler, name).toBe(handlers[name]);
    }
  });

  it('serves every write to admins only', () => {
    for (const name of ['createInstructor', 'updateInstructor', 'deleteInstructor'] as const) {
      expect(routes[name].roles, name).toBe('admin');
      expect(routes[name].handler, name).toBe(handlers[name]);
    }
    expect(routes['uploadInstructorImage'].roles).toBe('admin');
    expect(routes['uploadInstructorImage'].handler).toBe(uploadInstructorImage);
  });

  it('validates and checks email uniqueness on create', () => {
    expect(mocks.validators).toEqual([instructorValidation]);
    expect(mocks.unique).toEqual([handlers.createInstructorEmailUniqueness]);
  });
});
