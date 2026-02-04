'use client';

import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Skeleton,
  Alert,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import type { Registration, RequestState, Class } from '@maple/ts/domain';

interface RegistrationListProps {
  registrationsState: RequestState<Registration[]>;
  classes?: Class[];
  onViewDetail: (registration: Registration) => void;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getStatusColor(
  status: string
): 'success' | 'warning' | 'error' | 'default' | 'info' {
  switch (status) {
    case 'confirmed':
      return 'success';
    case 'pending':
      return 'warning';
    case 'cancelled':
      return 'error';
    case 'refunded':
      return 'info';
    case 'no-show':
      return 'default';
    default:
      return 'default';
  }
}

export function RegistrationList({
  registrationsState,
  classes = [],
  onViewDetail,
}: RegistrationListProps) {
  if (
    registrationsState.status === 'loading' ||
    registrationsState.status === 'idle'
  ) {
    return (
      <Box sx={{ mt: 2 }}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} height={60} sx={{ mb: 1 }} />
        ))}
      </Box>
    );
  }

  if (registrationsState.status === 'error') {
    return (
      <Alert severity="error" sx={{ mt: 2 }}>
        Failed to load registrations: {registrationsState.error}
      </Alert>
    );
  }

  const registrations = registrationsState.data;

  if (registrations.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
        <Typography variant="h6">No registrations found</Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>
          Registrations will appear here as customers sign up for classes.
        </Typography>
      </Box>
    );
  }

  const classMap = new Map(classes.map((c) => [c.id, c.name]));

  return (
    <TableContainer component={Paper} sx={{ mt: 2 }}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Customer</TableCell>
            <TableCell>Class</TableCell>
            <TableCell>Qty</TableCell>
            <TableCell>Amount</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Date</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {registrations.map((registration) => (
            <TableRow key={registration.id} hover>
              <TableCell>
                <Typography variant="body2" fontWeight={500}>
                  {registration.customerName}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {registration.customerEmail}
                </Typography>
              </TableCell>
              <TableCell>
                {classMap.get(registration.classId) || registration.classId}
              </TableCell>
              <TableCell>{registration.quantity}</TableCell>
              <TableCell>{formatCents(registration.pricePaidCents)}</TableCell>
              <TableCell>
                <Chip
                  label={registration.status}
                  size="small"
                  color={getStatusColor(registration.status)}
                />
              </TableCell>
              <TableCell>
                <Typography variant="caption">
                  {formatDate(registration.createdAt)}
                </Typography>
              </TableCell>
              <TableCell align="right">
                <IconButton
                  size="small"
                  onClick={() => onViewDetail(registration)}
                >
                  <VisibilityIcon fontSize="small" />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
