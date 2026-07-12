'use client';

import { useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  Chip,
  Alert,
  Snackbar,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import type {
  Registration,
  RegistrationStatus,
} from '@maple/ts/domain';
import {
  RegistrationList,
  RegistrationDetailDialog,
} from '@maple/react/registrations';
import {
  useRegistrations,
  useClasses,
  useClassWaitlist,
} from '../../../../../hooks';
import type { UseRegistrationsFilters } from '@maple/react/data';

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatPrice(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

export default function ClassRosterPage() {
  const params = useParams();
  const classId = params.classId as string;

  const [statusFilter, setStatusFilter] = useState<RegistrationStatus | ''>('');
  const [copySuccess, setCopySuccess] = useState(false);

  const filters: UseRegistrationsFilters = useMemo(
    () => ({
      classId,
      ...(statusFilter ? { status: statusFilter } : {}),
    }),
    [classId, statusFilter]
  );

  const { registrationsState, cancelRegistration, updateRegistration } =
    useRegistrations(filters);

  const { waitlistState } = useClassWaitlist(classId);

  const { classesState } = useClasses();

  const currentClass = useMemo(() => {
    if (classesState.status !== 'success') return null;
    return classesState.data.find((c) => c.id === classId) ?? null;
  }, [classesState, classId]);

  const classes = useMemo(
    () => (classesState.status === 'success' ? classesState.data : []),
    [classesState]
  );

  const registrations = useMemo(
    () =>
      registrationsState.status === 'success'
        ? registrationsState.data
        : [],
    [registrationsState]
  );

  const confirmedRegistrations = useMemo(
    () => registrations.filter((r) => r.status === 'confirmed' || r.status === 'pending'),
    [registrations]
  );

  const spotsFilled = useMemo(
    () => confirmedRegistrations.reduce((sum, r) => sum + r.quantity, 0),
    [confirmedRegistrations]
  );

  // Detail dialog
  const [selectedRegistration, setSelectedRegistration] =
    useState<Registration | null>(null);

  const handleViewDetail = useCallback((registration: Registration) => {
    setSelectedRegistration(registration);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedRegistration(null);
  }, []);

  const handleCancel = useCallback(
    async (id: string, refund: boolean) => {
      return cancelRegistration(id, refund);
    },
    [cancelRegistration]
  );

  const handleUpdateNotes = useCallback(
    async (id: string, notes: string) => {
      await updateRegistration({ id, notes });
    },
    [updateRegistration]
  );

  const handleCopyEmails = useCallback(() => {
    const emails = confirmedRegistrations
      .map((r) => r.customerEmail)
      .filter((email, index, arr) => arr.indexOf(email) === index) // dedupe
      .join(', ');

    navigator.clipboard.writeText(emails).then(() => {
      setCopySuccess(true);
    });
  }, [confirmedRegistrations]);

  const waitlistEntries = useMemo(
    () => (waitlistState.status === 'success' ? waitlistState.data : []),
    [waitlistState]
  );

  const handleCopyWaitlistEmails = useCallback(() => {
    const emails = waitlistEntries
      .map((e) => e.email)
      .filter((email, index, arr) => arr.indexOf(email) === index) // dedupe
      .join(', ');

    navigator.clipboard.writeText(emails).then(() => {
      setCopySuccess(true);
    });
  }, [waitlistEntries]);

  const classMap = useMemo(
    () => new Map(classes.map((c) => [c.id, c.name])),
    [classes]
  );

  const renderWaitlistBody = () => {
    if (
      waitlistState.status === 'loading' ||
      waitlistState.status === 'idle'
    ) {
      return (
        <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 2 }} />
      );
    }
    if (waitlistState.status === 'error') {
      return <Alert severity="error">{waitlistState.error}</Alert>;
    }
    if (waitlistEntries.length === 0) {
      return (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            No one is on the waitlist for this class.
          </Typography>
        </Paper>
      );
    }
    return (
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>#</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Joined</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {waitlistEntries.map((entry, index) => (
              <TableRow key={entry.id}>
                <TableCell>{index + 1}</TableCell>
                <TableCell>{entry.email}</TableCell>
                <TableCell>
                  {formatDate(entry.createdAt)} at {formatTime(entry.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  };

  return (
    <>
      {/* Back link */}
      <Button
        startIcon={<ArrowBackIcon />}
        href="/classes"
        sx={{ mb: 2 }}
        size="small"
      >
        Back to Classes
      </Button>

      {/* Class Header */}
      {classesState.status === 'loading' ? (
        <Skeleton variant="rectangular" height={120} sx={{ mb: 3, borderRadius: 2 }} />
      ) : currentClass ? (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              gap: 2,
            }}
          >
            <Box>
              <Typography variant="h4" component="h1" gutterBottom>
                {currentClass.name}
              </Typography>
              <Typography variant="body1" color="text.secondary">
                {(() => {
                  const first = currentClass.sessions?.[0];
                  if (!first) return '';
                  return `${formatDate(first.dateTime)} at ${formatTime(first.dateTime)}`;
                })()}{currentClass.sessions.length > 1 ? ` (+${currentClass.sessions.length - 1} more)` : ''} &middot;{' '}
                {currentClass.durationMinutes} min
              </Typography>
              {currentClass.location && (
                <Typography variant="body2" color="text.secondary">
                  {currentClass.location}
                </Typography>
              )}
            </Box>
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="h5" fontWeight={700}>
                {spotsFilled} / {currentClass.capacity}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                spots filled
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {formatPrice(currentClass.priceCents)} per spot
              </Typography>
            </Box>
          </Box>
        </Paper>
      ) : (
        <Alert severity="error" sx={{ mb: 3 }}>
          Class not found
        </Alert>
      )}

      {/* Actions Bar */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Typography variant="h6">Roster</Typography>
          {registrationsState.status === 'success' && (
            <Chip
              label={`${registrations.length} registration${registrations.length === 1 ? '' : 's'}`}
              size="small"
            />
          )}
        </Box>

        <Box sx={{ display: 'flex', gap: 2 }}>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={statusFilter}
              label="Status"
              onChange={(e) =>
                setStatusFilter(e.target.value as RegistrationStatus | '')
              }
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="confirmed">Confirmed</MenuItem>
              <MenuItem value="pending">Pending</MenuItem>
              <MenuItem value="cancelled">Cancelled</MenuItem>
              <MenuItem value="refunded">Refunded</MenuItem>
              <MenuItem value="no-show">No Show</MenuItem>
            </Select>
          </FormControl>

          <Button
            variant="outlined"
            startIcon={<ContentCopyIcon />}
            onClick={handleCopyEmails}
            disabled={confirmedRegistrations.length === 0}
            size="small"
          >
            Copy Emails ({confirmedRegistrations.length})
          </Button>
        </Box>
      </Box>

      {/* Registrations Table */}
      <RegistrationList
        registrationsState={registrationsState}
        classes={classes}
        onViewDetail={handleViewDetail}
      />

      {/* Waitlist */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mt: 4,
          mb: 2,
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Typography variant="h6">Waitlist</Typography>
          {waitlistState.status === 'success' && (
            <Chip
              label={`${waitlistEntries.length} waiting`}
              size="small"
              color={waitlistEntries.length > 0 ? 'primary' : 'default'}
            />
          )}
        </Box>
        <Button
          variant="outlined"
          startIcon={<ContentCopyIcon />}
          onClick={handleCopyWaitlistEmails}
          disabled={waitlistEntries.length === 0}
          size="small"
        >
          Copy Emails ({waitlistEntries.length})
        </Button>
      </Box>

      {renderWaitlistBody()}

      {/* Detail Dialog */}
      <RegistrationDetailDialog
        open={!!selectedRegistration}
        onClose={handleCloseDetail}
        registration={selectedRegistration}
        className={
          selectedRegistration
            ? classMap.get(selectedRegistration.classId)
            : undefined
        }
        onCancel={handleCancel}
        onUpdateNotes={handleUpdateNotes}
      />

      {/* Copy success toast */}
      <Snackbar
        open={copySuccess}
        autoHideDuration={3000}
        onClose={() => setCopySuccess(false)}
        message="Email addresses copied to clipboard"
      />
    </>
  );
}
