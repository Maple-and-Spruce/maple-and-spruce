'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import type { Employee } from '@maple/ts/domain';
import {
  EmployeeForm,
  EmployeeList,
  type EmployeeFormSubmit,
} from '@maple/react/timesheet';
import { useEmployees, useUsers } from '../../../hooks';

export default function EmployeesPage() {
  const router = useRouter();
  const { employeesState, createEmployee, updateEmployee } = useEmployees(
    true
  );
  const { usersState } = useUsers();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const employees =
    employeesState.status === 'success' ? employeesState.data : [];

  // Users available for the picker — anyone signed up who doesn't already
  // have an employee record. Users with `inactive` employee status are
  // excluded too; the admin should reactivate via "Edit" instead of
  // creating a duplicate record.
  const availableUsers = useMemo(() => {
    if (usersState.status !== 'success') return undefined;
    return usersState.data.filter((u) => !u.employee);
  }, [usersState]);

  const handleOpenAdd = () => {
    setEditing(undefined);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (employeeId: string) => {
    const found = employees.find((e) => e.employee.id === employeeId);
    if (!found) return;
    setEditing(found.employee);
    setIsFormOpen(true);
  };

  const handleClose = useCallback(() => {
    setIsFormOpen(false);
    setEditing(undefined);
  }, []);

  const handleSubmit = useCallback(
    async (submit: EmployeeFormSubmit) => {
      setIsSubmitting(true);
      setActionError(null);
      try {
        if (submit.mode === 'create') {
          await createEmployee(submit.input);
        } else {
          await updateEmployee(submit.input);
        }
      } catch (e) {
        setActionError(
          e instanceof Error ? e.message : 'Failed to save employee'
        );
        throw e;
      } finally {
        setIsSubmitting(false);
      }
    },
    [createEmployee, updateEmployee]
  );

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Box>
          <Typography variant="h4" component="h1">
            Employees
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Hourly workers who can log time on the Timesheet page.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleOpenAdd}
        >
          Add employee
        </Button>
      </Box>

      <Stack spacing={2}>
        {actionError && (
          <Alert severity="error" onClose={() => setActionError(null)}>
            {actionError}
          </Alert>
        )}

        {employeesState.status === 'error' && (
          <Alert severity="error">
            Couldn&apos;t load employees: {employeesState.error}
          </Alert>
        )}

        <EmployeeList
          employees={employees}
          onEdit={handleOpenEdit}
          onViewTimesheet={() => router.push('/timesheet')}
        />
      </Stack>

      <EmployeeForm
        open={isFormOpen}
        onClose={handleClose}
        onSubmit={handleSubmit}
        employee={editing}
        availableUsers={availableUsers}
        usersLoading={
          usersState.status === 'idle' || usersState.status === 'loading'
        }
        isSubmitting={isSubmitting}
      />
    </>
  );
}
