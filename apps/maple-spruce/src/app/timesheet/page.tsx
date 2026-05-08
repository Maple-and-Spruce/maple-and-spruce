'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import {
  TimeEntryForm,
  TimeEntryList,
  UnpaidTotalCard,
  formatCurrency,
} from '@maple/react/timesheet';
import { AppShell } from '../../components/layout';
import {
  useAuth,
  useEmployees,
  useTimeEntries,
  useUserRole,
} from '../../hooks';

export default function TimesheetPage() {
  const { user } = useAuth();
  const { isAdmin, isCheckingRole } = useUserRole();

  // Admin sees an employee selector; default to "self if also an employee", else first.
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(
    null
  );

  // useEmployees runs the admin-only getEmployees call. Skipping it for non-admin
  // would require a conditional hook — instead, rely on the cloud function returning
  // 403 and the resulting error state silently no-oping. We still mount the hook
  // for admin and ignore for employee.
  const { employeesState } = useEmployees();

  // Pick the target employee for the timesheet view
  const targetEmployeeId: string | undefined = useMemo(() => {
    if (!user?.uid) return undefined;
    if (!isAdmin) return user.uid;
    return selectedEmployeeId ?? undefined;
  }, [isAdmin, selectedEmployeeId, user?.uid]);

  // Default the admin selector to the first employee (if any) once loaded
  useEffect(() => {
    if (
      isAdmin &&
      selectedEmployeeId === null &&
      employeesState.status === 'success' &&
      employeesState.data.length > 0
    ) {
      setSelectedEmployeeId(employeesState.data[0].employee.id);
    }
  }, [isAdmin, selectedEmployeeId, employeesState]);

  const {
    entriesState,
    createEntry,
    deleteEntry,
    markPaid,
  } = useTimeEntries(
    targetEmployeeId ? { employeeId: targetEmployeeId } : undefined
  );

  const [isMarkingPaid, setIsMarkingPaid] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const entries =
    entriesState.status === 'success' ? entriesState.data : [];
  const unpaidEntries = entries.filter((e) => e.status === 'unpaid');
  const unpaidHours = unpaidEntries.reduce((sum, e) => sum + e.hours, 0);

  // Look up the selected employee's hourly rate for the dollar total.
  const selectedEmployee = useMemo(() => {
    if (employeesState.status !== 'success') return undefined;
    return employeesState.data.find(
      (e) => e.employee.id === targetEmployeeId
    )?.employee;
  }, [employeesState, targetEmployeeId]);

  const unpaidDollars =
    selectedEmployee !== undefined
      ? Math.round(unpaidHours * selectedEmployee.hourlyRate * 100) / 100
      : undefined;

  const handleLog = async (input: {
    employeeId: string;
    date: string;
    hours: number;
    notes?: string;
  }) => {
    setActionError(null);
    try {
      await createEntry(input);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to log entry');
      throw e;
    }
  };

  const handleDelete = async (id: string) => {
    setActionError(null);
    try {
      await deleteEntry(id);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to delete entry');
    }
  };

  const handleMarkPaid = async (ids: string[]) => {
    setActionError(null);
    setIsMarkingPaid(true);
    try {
      const result = await markPaid(ids);
      if (result.alreadyPaidCount > 0) {
        setActionError(
          `${result.alreadyPaidCount} entr${
            result.alreadyPaidCount === 1 ? 'y was' : 'ies were'
          } already paid and skipped.`
        );
      }
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : 'Failed to mark entries paid'
      );
    } finally {
      setIsMarkingPaid(false);
    }
  };

  return (
    <AppShell>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" component="h1">
          {isAdmin ? 'Timesheets' : 'My timesheet'}
        </Typography>
        {isAdmin && (
          <Typography variant="body2" color="text.secondary">
            Review hours and mark them paid when you've paid out.
          </Typography>
        )}
      </Box>

      {actionError && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          onClose={() => setActionError(null)}
        >
          {actionError}
        </Alert>
      )}

      {isCheckingRole ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress color="primary" />
        </Box>
      ) : isAdmin ? (
        <Stack spacing={2}>
          <FormControl sx={{ maxWidth: 360 }}>
            <InputLabel id="employee-select-label">Employee</InputLabel>
            <Select
              labelId="employee-select-label"
              label="Employee"
              value={selectedEmployeeId ?? ''}
              onChange={(e) => setSelectedEmployeeId(e.target.value || null)}
            >
              {employeesState.status === 'success' &&
                employeesState.data.map(({ employee, unpaidAmountDollars }) => (
                  <MenuItem key={employee.id} value={employee.id}>
                    {employee.name}
                    {unpaidAmountDollars > 0
                      ? ` — ${formatCurrency(unpaidAmountDollars)} owed`
                      : ''}
                  </MenuItem>
                ))}
            </Select>
          </FormControl>

          {targetEmployeeId ? (
            <>
              <UnpaidTotalCard
                unpaidHours={unpaidHours}
                unpaidAmountDollars={unpaidDollars}
                label={`Unpaid for ${selectedEmployee?.name ?? 'this employee'}`}
              />
              <TimeEntryList
                entries={entries}
                adminMode
                callerUid={user?.uid}
                onDelete={handleDelete}
                onMarkPaid={handleMarkPaid}
                isMarkingPaid={isMarkingPaid}
              />
            </>
          ) : (
            <Typography color="text.secondary">
              No employees yet. Add one on the Employees page to start
              tracking hours.
            </Typography>
          )}
        </Stack>
      ) : (
        <Stack spacing={2}>
          <UnpaidTotalCard unpaidHours={unpaidHours} />
          {user?.uid && (
            <TimeEntryForm employeeId={user.uid} onSubmit={handleLog} />
          )}
          <TimeEntryList
            entries={entries}
            callerUid={user?.uid}
            onDelete={handleDelete}
          />
        </Stack>
      )}
    </AppShell>
  );
}
