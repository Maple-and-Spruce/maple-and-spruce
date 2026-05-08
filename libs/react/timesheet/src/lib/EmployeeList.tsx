'use client';

import {
  Button,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { EmployeeWithUnpaid } from '@maple/ts/domain';
import { formatCurrency, formatHours } from './format';

export interface EmployeeListProps {
  employees: EmployeeWithUnpaid[];
  onEdit?: (employeeId: string) => void;
  onViewTimesheet?: (employeeId: string) => void;
}

export function EmployeeList({
  employees,
  onEdit,
  onViewTimesheet,
}: EmployeeListProps) {
  if (employees.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">
          No employees yet. Add one to start tracking hours.
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>Email</TableCell>
            <TableCell align="right">Rate</TableCell>
            <TableCell align="right">Unpaid hours</TableCell>
            <TableCell align="right">Owed</TableCell>
            <TableCell>Status</TableCell>
            <TableCell align="right" />
          </TableRow>
        </TableHead>
        <TableBody>
          {employees.map(({ employee, unpaidHours, unpaidAmountDollars }) => (
            <TableRow key={employee.id} hover>
              <TableCell>{employee.name}</TableCell>
              <TableCell>{employee.email}</TableCell>
              <TableCell align="right">
                {formatCurrency(employee.hourlyRate)}/hr
              </TableCell>
              <TableCell align="right">{formatHours(unpaidHours)}</TableCell>
              <TableCell align="right">
                {formatCurrency(unpaidAmountDollars)}
              </TableCell>
              <TableCell>
                <Chip
                  size="small"
                  label={employee.status === 'active' ? 'Active' : 'Inactive'}
                  color={employee.status === 'active' ? 'success' : 'default'}
                  variant="outlined"
                />
              </TableCell>
              <TableCell align="right">
                {onViewTimesheet && (
                  <Button
                    size="small"
                    onClick={() => onViewTimesheet(employee.id)}
                    sx={{ mr: 1 }}
                  >
                    Timesheet
                  </Button>
                )}
                {onEdit && (
                  <Button size="small" onClick={() => onEdit(employee.id)}>
                    Edit
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );
}
