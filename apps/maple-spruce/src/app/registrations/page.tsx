'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import type {
  Registration,
  RegistrationStatus,
} from '@maple/ts/domain';
import {
  RegistrationList,
  RegistrationDetailDialog,
} from '@maple/react/registrations';
import { AppShell } from '../../components/layout';
import { useRegistrations, useClasses } from '../../hooks';
import type { UseRegistrationsFilters } from '@maple/react/data';

export default function RegistrationsPage() {
  // Filters
  const [filters, setFilters] = useState<UseRegistrationsFilters>({});

  const { registrationsState, cancelRegistration, updateRegistration } =
    useRegistrations(filters);

  // Fetch all classes for name lookup
  const { classesState } = useClasses();

  const classes = useMemo(
    () => (classesState.status === 'success' ? classesState.data : []),
    [classesState]
  );

  // Detail dialog state
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

  const classMap = useMemo(
    () => new Map(classes.map((c) => [c.id, c.name])),
    [classes]
  );

  return (
    <AppShell>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Typography variant="h4" component="h1">
          Registrations
        </Typography>
      </Box>

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Filter by Class</InputLabel>
          <Select
            value={filters.classId ?? ''}
            label="Filter by Class"
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                classId: e.target.value || undefined,
              }))
            }
          >
            <MenuItem value="">
              <em>All Classes</em>
            </MenuItem>
            {classes.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Filter by Status</InputLabel>
          <Select
            value={filters.status ?? ''}
            label="Filter by Status"
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                status: (e.target.value as RegistrationStatus) || undefined,
              }))
            }
          >
            <MenuItem value="">
              <em>All Statuses</em>
            </MenuItem>
            <MenuItem value="pending">Pending</MenuItem>
            <MenuItem value="confirmed">Confirmed</MenuItem>
            <MenuItem value="cancelled">Cancelled</MenuItem>
            <MenuItem value="refunded">Refunded</MenuItem>
            <MenuItem value="no-show">No Show</MenuItem>
          </Select>
        </FormControl>
      </Box>

      <RegistrationList
        registrationsState={registrationsState}
        classes={classes}
        onViewDetail={handleViewDetail}
      />

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
    </AppShell>
  );
}
