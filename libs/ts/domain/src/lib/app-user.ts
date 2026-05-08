/**
 * AppUser
 *
 * The shape returned by `listUsers` for the admin /users page — a Firebase
 * Auth user joined with the role records that gate access to the admin app.
 *
 * Email may be null because Firebase Auth allows phone-only and anonymous
 * accounts; in practice every account in this project signs up with email,
 * but we keep the type honest.
 */

import type { Employee } from './employee';

export interface AppUser {
  uid: string;
  email: string | null;
  displayName?: string;
  photoUrl?: string;
  emailVerified: boolean;
  disabled: boolean;
  createdAt: Date;
  lastSignInAt?: Date;
  /** True if the user has an `admins/{uid}` record. */
  isAdmin: boolean;
  /**
   * The employee record if one exists, regardless of active/inactive.
   * `employee.status === 'inactive'` is how a revoked employee role looks —
   * the doc stays for history.
   */
  employee?: Employee;
}
