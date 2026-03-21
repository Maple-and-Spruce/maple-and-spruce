'use client';

import { useState, useCallback } from 'react';
import { Box, Typography, Button } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import type { CalendarEvent, CreateCalendarEventInput } from '@maple/ts/domain';
import { DeleteConfirmDialog } from '@maple/react/ui';
import {
  CalendarEventList,
  CalendarEventForm,
  CalendarEventFilterToolbar,
  type CalendarEventFilterValues,
} from '@maple/react/events';
import { AppShell } from '../../components/layout';
import { useCalendarEvents } from '../../hooks';

export default function EventsPage() {
  // Filter state
  const [filters, setFilters] = useState<CalendarEventFilterValues>({});

  // Calendar event state from hook (fetches on mount)
  const {
    calendarEventsState,
    createCalendarEvent,
    updateCalendarEvent,
    deleteCalendarEvent: deleteCalendarEventApi,
  } = useCalendarEvents(filters);

  // Form dialog state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<
    CalendarEvent | undefined
  >();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete dialog state
  const [eventToDelete, setEventToDelete] = useState<CalendarEvent | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);

  const handleFiltersChange = useCallback(
    (newFilters: CalendarEventFilterValues) => {
      setFilters(newFilters);
    },
    []
  );

  const handleOpenForm = useCallback((event?: CalendarEvent) => {
    setEditingEvent(event);
    setIsFormOpen(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setIsFormOpen(false);
    setEditingEvent(undefined);
  }, []);

  const handleSubmitForm = useCallback(
    async (data: CreateCalendarEventInput) => {
      setIsSubmitting(true);

      try {
        if (editingEvent) {
          await updateCalendarEvent({ id: editingEvent.id, ...data });
        } else {
          await createCalendarEvent(data);
        }
        handleCloseForm();
      } catch (error) {
        console.error('Failed to save calendar event:', error);
        throw error;
      } finally {
        setIsSubmitting(false);
      }
    },
    [editingEvent, handleCloseForm, createCalendarEvent, updateCalendarEvent]
  );

  const handleOpenDelete = useCallback((event: CalendarEvent) => {
    setEventToDelete(event);
  }, []);

  const handleCloseDelete = useCallback(() => {
    setEventToDelete(null);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!eventToDelete) return;

    setIsDeleting(true);

    try {
      await deleteCalendarEventApi(eventToDelete.id);
      handleCloseDelete();
    } catch (error) {
      console.error('Failed to delete calendar event:', error);
    } finally {
      setIsDeleting(false);
    }
  }, [eventToDelete, handleCloseDelete, deleteCalendarEventApi]);

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
          Calendar Events
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenForm()}
        >
          Add Event
        </Button>
      </Box>

      <CalendarEventFilterToolbar
        filters={filters}
        onFiltersChange={handleFiltersChange}
      />

      <CalendarEventList
        calendarEventsState={calendarEventsState}
        onEdit={handleOpenForm}
        onDelete={handleOpenDelete}
      />

      <CalendarEventForm
        open={isFormOpen}
        onClose={handleCloseForm}
        onSubmit={handleSubmitForm}
        calendarEvent={editingEvent}
        isSubmitting={isSubmitting}
      />

      <DeleteConfirmDialog
        open={!!eventToDelete}
        onClose={handleCloseDelete}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
        title="Delete Calendar Event?"
        itemName={eventToDelete?.title ?? ''}
      />
    </AppShell>
  );
}
