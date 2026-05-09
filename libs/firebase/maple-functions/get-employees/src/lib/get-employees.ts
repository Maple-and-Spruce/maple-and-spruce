/**
 * Get Employees Cloud Function
 *
 * Admin-only listing of employees with their unpaid hour totals and
 * computed dollar amount owed. The amount uses each employee's CURRENT
 * `hourlyRate` (not the snapshot on the entry) to match the user's
 * stated preference: "if you change the rate, all unpaid hours
 * retroactively use the new rate."
 */
import { createAdminFunction } from '@maple/firebase/functions';
import {
  EmployeeRepository,
  TimeEntryRepository,
} from '@maple/firebase/database';
import type {
  GetEmployeesRequest,
  GetEmployeesResponse,
} from '@maple/ts/firebase/api-types';

export const getEmployees = createAdminFunction<
  GetEmployeesRequest,
  GetEmployeesResponse
>(async (data) => {
  const employees = await EmployeeRepository.findAll(
    data.includeInactive ? undefined : { status: 'active' }
  );

  const unpaid = await TimeEntryRepository.findAll({ status: 'unpaid' });

  const result = employees.map((employee) => {
    const ownEntries = unpaid.filter((e) => e.employeeId === employee.id);
    const unpaidHours = ownEntries.reduce((sum, e) => sum + e.hours, 0);
    return {
      employee,
      unpaidHours,
      unpaidAmountDollars:
        Math.round(unpaidHours * employee.hourlyRate * 100) / 100,
    };
  });

  return { employees: result };
});
