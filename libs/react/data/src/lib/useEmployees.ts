'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type {
  Employee,
  EmployeeWithUnpaid,
  CreateEmployeeInput,
  UpdateEmployeeInput,
  RequestState,
} from '@maple/ts/domain';
import type {
  GetEmployeesRequest,
  GetEmployeesResponse,
  CreateEmployeeRequest,
  CreateEmployeeResponse,
  UpdateEmployeeRequest,
  UpdateEmployeeResponse,
} from '@maple/ts/firebase/api-types';

export function useEmployees(includeInactive = false) {
  const [employeesState, setEmployeesState] = useState<
    RequestState<EmployeeWithUnpaid[]>
  >({ status: 'idle' });

  const fetchEmployees = useCallback(async () => {
    setEmployeesState({ status: 'loading' });
    try {
      const fn = httpsCallable<GetEmployeesRequest, GetEmployeesResponse>(
        getMapleFunctions(),
        'getEmployees'
      );
      const result = await fn({ includeInactive });
      setEmployeesState({ status: 'success', data: result.data.employees });
    } catch (error) {
      console.error('Failed to fetch employees:', error);
      setEmployeesState({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch employees',
      });
    }
  }, [includeInactive]);

  const createEmployee = useCallback(
    async (input: CreateEmployeeInput): Promise<Employee> => {
      const fn = httpsCallable<
        CreateEmployeeRequest,
        CreateEmployeeResponse
      >(getMapleFunctions(), 'createEmployee');
      const result = await fn(input);
      // Refetch to merge in the unpaid totals (zero for a brand-new employee)
      await fetchEmployees();
      return result.data.employee;
    },
    [fetchEmployees]
  );

  const updateEmployee = useCallback(
    async (input: UpdateEmployeeInput): Promise<Employee> => {
      const fn = httpsCallable<
        UpdateEmployeeRequest,
        UpdateEmployeeResponse
      >(getMapleFunctions(), 'updateEmployee');
      const result = await fn(input);
      await fetchEmployees();
      return result.data.employee;
    },
    [fetchEmployees]
  );

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  return {
    employeesState,
    fetchEmployees,
    createEmployee,
    updateEmployee,
  };
}
