/**
 * people — students and portal users, as one Cloud Function (ADR-029, #65).
 *
 * Students are gated `[Admin, LessonTeacher]`, with a lesson teacher narrowed
 * to their own students inside each handler (`students.ts`). Users and roles
 * are admin-only (`users.ts`).
 *
 * Deliberately not here:
 * - `getMyRoles` decides what every admin page shows, on first paint. It stays
 *   its own function so the portal's gate never waits on, or shares a crash
 *   with, the student and user routes.
 * - `getSquareCardCandidates` / `updateStudentSquareCard` live in the
 *   `maple-square` codebase with Square secrets; a router is per codebase.
 * - `checkAdminStatus` is only called by the deprecated `AdminGuard`.
 *
 * Each route spells its gate out in full: `tools/check-callable-roles.ts` reads
 * `requiringRole` off the AST and cannot see through a helper.
 */
import { Functions, Role } from '@maple/firebase/functions';
import type {
  CreateStudentRequest,
  CreateStudentResponse,
  DeleteStudentRequest,
  DeleteStudentResponse,
  GetStudentRequest,
  GetStudentResponse,
  GetStudentsRequest,
  GetStudentsResponse,
  GetUsersRequest,
  GetUsersResponse,
  GrantAdminRoleRequest,
  GrantAdminRoleResponse,
  GrantRoleRequest,
  GrantRoleResponse,
  RevokeAdminRoleRequest,
  RevokeAdminRoleResponse,
  RevokeRoleRequest,
  RevokeRoleResponse,
  UpdateStudentRequest,
  UpdateStudentResponse,
} from '@maple/ts/firebase/api-types';
import {
  createStudent,
  deleteStudent,
  getStudent,
  getStudents,
  updateStudent,
} from './students';
import {
  grantAdminRole,
  grantRole,
  listUsers,
  revokeAdminRole,
  revokeRole,
} from './users';

export const people = Functions.router('people', {
  getStudents: Functions.endpoint
    .requiringRole([Role.Admin, Role.LessonTeacher])
    .asRoute<GetStudentsRequest, GetStudentsResponse>(getStudents),

  getStudent: Functions.endpoint
    .requiringRole([Role.Admin, Role.LessonTeacher])
    .asRoute<GetStudentRequest, GetStudentResponse>(getStudent),

  createStudent: Functions.endpoint
    .requiringRole([Role.Admin, Role.LessonTeacher])
    .asRoute<CreateStudentRequest, CreateStudentResponse>(createStudent),

  updateStudent: Functions.endpoint
    .requiringRole([Role.Admin, Role.LessonTeacher])
    .asRoute<UpdateStudentRequest, UpdateStudentResponse>(updateStudent),

  deleteStudent: Functions.endpoint
    .requiringRole([Role.Admin, Role.LessonTeacher])
    .asRoute<DeleteStudentRequest, DeleteStudentResponse>(deleteStudent),

  listUsers: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<GetUsersRequest, GetUsersResponse>(listUsers),

  grantAdminRole: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<GrantAdminRoleRequest, GrantAdminRoleResponse>(grantAdminRole),

  revokeAdminRole: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<RevokeAdminRoleRequest, RevokeAdminRoleResponse>(revokeAdminRole),

  grantRole: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<GrantRoleRequest, GrantRoleResponse>(grantRole),

  revokeRole: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<RevokeRoleRequest, RevokeRoleResponse>(revokeRole),
});
