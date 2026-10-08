import { describe, it, expect, vi } from 'vitest';

/**
 * The people router's wiring: every route present, gated as it was as a
 * standalone function, and served by its handler. The handlers are tested in
 * students.spec.ts and the per-route user specs; the real gates are checked
 * against the emulator in the role matrix.
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

vi.mock('./students', () => ({
  getStudents: vi.fn(),
  getStudent: vi.fn(),
  createStudent: vi.fn(),
  updateStudent: vi.fn(),
  deleteStudent: vi.fn(),
}));

vi.mock('./users', () => ({
  listUsers: vi.fn(),
  grantAdminRole: vi.fn(),
  revokeAdminRole: vi.fn(),
  grantRole: vi.fn(),
  revokeRole: vi.fn(),
}));

import { people } from './people.router';
import * as students from './students';
import * as users from './users';

type Route = { roles: unknown; handler: unknown };
const routes = people as unknown as Record<string, Route>;

describe('people router', () => {
  it('serves students to admins and lesson teachers', () => {
    for (const name of ['getStudents', 'getStudent', 'createStudent', 'updateStudent', 'deleteStudent']) {
      expect(routes[name].roles, name).toEqual(['admin', 'lesson-teacher']);
      expect(routes[name].handler, name).toBe(students[name as keyof typeof students]);
    }
  });

  it('serves users and roles to admins only', () => {
    for (const name of ['listUsers', 'grantAdminRole', 'revokeAdminRole', 'grantRole', 'revokeRole']) {
      expect(routes[name].roles, name).toBe('admin');
      expect(routes[name].handler, name).toBe(users[name as keyof typeof users]);
    }
  });

  it('has exactly these ten routes (getMyRoles stays its own function)', () => {
    expect(Object.keys(routes).sort()).toEqual([
      'createStudent',
      'deleteStudent',
      'getStudent',
      'getStudents',
      'grantAdminRole',
      'grantRole',
      'listUsers',
      'revokeAdminRole',
      'revokeRole',
      'updateStudent',
    ]);
  });
});
