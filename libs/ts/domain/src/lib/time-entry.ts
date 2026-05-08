/**
 * Time entry domain types
 *
 * Captures hours worked by an Employee for payroll tracking.
 * Each entry is tied to an employee (by Firebase Auth UID) and has an
 * unpaid -> paid lifecycle. Once paid, entries become immutable for
 * non-admin users.
 */

export type TimeEntryStatus = 'unpaid' | 'paid';

export interface TimeEntry {
  id: string;
  /** Firebase Auth UID of the employee whose hours these are */
  employeeId: string;
  /** Work date in YYYY-MM-DD (local). Distinct from createdAt. */
  date: string;
  /** Hours worked (must be > 0 and <= 24) */
  hours: number;
  notes?: string;
  status: TimeEntryStatus;
  /** Hourly rate in dollars at the time the entry was created. Used for paid-period totals. */
  hourlyRateAtCreation: number;
  /** Set when status transitions to 'paid' */
  paidAt?: Date;
  /** Admin UID who marked the entry paid */
  paidBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateTimeEntryInput = Pick<
  TimeEntry,
  'employeeId' | 'date' | 'hours'
> & {
  notes?: string;
};

export type UpdateTimeEntryInput = {
  id: string;
  date?: string;
  hours?: number;
  notes?: string;
};
