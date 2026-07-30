'use client';

/**
 * EditLessonDialog — edit a single lesson's time, duration, teacher
 * (substitute), and notes. For cancellation the page uses a dedicated
 * confirm dialog rather than this form.
 *
 * Signals idiom (matches post-#287 pattern).
 */

import { useCallback, useEffect } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3';
import type {
  Instructor,
  Lesson,
  LessonBlock,
  Room,
  UpdateLessonInput,
} from '@maple/ts/domain';
import { ROOMS, getRoomLabel, lessonFitsBlock } from '@maple/ts/domain';
import { lessonValidation } from '@maple/ts/validation';
import {
  batch,
  useComputed,
  useSignal,
  useSignals,
} from '@maple/react/signals';
import { formatBlockOption } from './block-format';

interface EditLessonDialogProps {
  open: boolean;
  onClose: () => void;
  lesson?: Lesson;
  primaryTeacherId: string;
  instructors: Instructor[];
  /** All blocks; filtered to the lesson's teacher for the block picker (#689). */
  blocks: LessonBlock[];
  onSubmit: (input: UpdateLessonInput) => Promise<unknown>;
  isSubmitting?: boolean;
}

const DURATION_OPTIONS = [30, 45, 60] as const;

export function EditLessonDialog({
  open,
  onClose,
  lesson,
  primaryTeacherId,
  instructors,
  blocks,
  onSubmit,
  isSubmitting = false,
}: EditLessonDialogProps) {
  useSignals();

  const scheduledAt = useSignal<Date>(new Date());
  const durationMinutes = useSignal<30 | 45 | 60>(30);
  const teacherId = useSignal('');
  const blockId = useSignal('');
  const room = useSignal<Room>('spruce');
  const notes = useSignal('');

  const blocksForTeacher = (tid: string) =>
    blocks.filter((b) => b.teacherId === tid);
  const showValidationErrors = useSignal(false);
  const submitError = useSignal<string | null>(null);

  useEffect(() => {
    if (!open || !lesson) return;
    batch(() => {
      scheduledAt.value = new Date(lesson.scheduledAt);
      durationMinutes.value = lesson.durationMinutes as 30 | 45 | 60;
      teacherId.value = lesson.teacherId;
      blockId.value = lesson.blockId ?? '';
      room.value = lesson.room ?? 'spruce';
      notes.value = lesson.notes ?? '';
      showValidationErrors.value = false;
      submitError.value = null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lesson]);

  const validation = useComputed(() => {
    if (!lesson) return null;
    return lessonValidation({
      studentId: lesson.studentId,
      teacherId: teacherId.value,
      scheduledAt: scheduledAt.value,
      durationMinutes: durationMinutes.value,
      status: lesson.status,
      notes: notes.value || undefined,
    });
  });

  // Block attribution (#689). Unattributed ('') is allowed — a grandfathered
  // lesson stays editable. If a block is picked, a non-fitting time is a
  // non-blocking warning (the server enforces fit on reschedule).
  const blockFitWarning = useComputed<string | null>(() => {
    if (!blockId.value) return null;
    const b = blocks.find((bl) => bl.id === blockId.value);
    if (!b || b.teacherId !== teacherId.value) return null;
    return lessonFitsBlock(scheduledAt.value, durationMinutes.value, b)
      ? null
      : `This time falls outside the block (${formatBlockOption(b)}) and will be rejected on save.`;
  });

  const isValid = useComputed(() =>
    validation.value ? validation.value.isValid() : false,
  );

  const errorFor = (field: string): string | null => {
    if (!showValidationErrors.value || !validation.value) return null;
    return validation.value.getErrors(field)?.[0] ?? null;
  };

  const handleSubmit = useCallback(async () => {
    if (!lesson) return;
    showValidationErrors.value = true;
    if (!isValid.value) return;
    if (isSubmitting) return;

    submitError.value = null;
    try {
      const input: UpdateLessonInput = {
        id: lesson.id,
        scheduledAt: scheduledAt.value,
        durationMinutes: durationMinutes.value,
        teacherId: teacherId.value,
        blockId: blockId.value || null,
        room: room.value,
        notes: notes.value || undefined,
      };
      await onSubmit(input);
      onClose();
    } catch (error: unknown) {
      submitError.value =
        error instanceof Error ? error.message : 'Failed to update lesson';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson, onSubmit, onClose, isSubmitting]);

  if (!lesson) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>Edit lesson</DialogTitle>
        <DialogContent>
          <Alert severity="error">No lesson selected.</Alert>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit lesson</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {submitError.value && (
            <Alert severity="error" onClose={() => (submitError.value = null)}>
              {submitError.value}
            </Alert>
          )}

          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <DateTimePicker
              label="Date & time"
              value={scheduledAt.value}
              onChange={(v) => {
                if (v) scheduledAt.value = v;
              }}
              slotProps={{
                textField: {
                  fullWidth: true,
                  required: true,
                  error: !!errorFor('scheduledAt'),
                  helperText: errorFor('scheduledAt') ?? undefined,
                },
              }}
            />
          </LocalizationProvider>

          <FormControl fullWidth error={!!errorFor('teacherId')}>
            <InputLabel id="edit-teacher-label">Teacher</InputLabel>
            <Select
              labelId="edit-teacher-label"
              label="Teacher"
              value={teacherId.value}
              onChange={(e) => {
                teacherId.value = e.target.value;
                // Keep the block only if it still belongs to the new teacher.
                const stillValid = blocks.some(
                  (b) =>
                    b.id === blockId.value && b.teacherId === e.target.value,
                );
                if (!stillValid) blockId.value = '';
              }}
            >
              {instructors.map((i) => (
                <MenuItem key={i.id} value={i.id}>
                  {i.name}
                  {i.id === primaryTeacherId ? ' (primary)' : ''}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>
              {errorFor('teacherId') ?? 'Change this to record a substitute.'}
            </FormHelperText>
          </FormControl>

          {/* Block attribution (#689). Includes an explicit "unattributed"
              option so grandfathered lessons can stay as-is or be migrated. */}
          <FormControl fullWidth>
            <InputLabel id="edit-block-label">Block</InputLabel>
            <Select
              labelId="edit-block-label"
              label="Block"
              value={blockId.value}
              onChange={(e) => (blockId.value = e.target.value)}
            >
              <MenuItem value="">
                <em>Unattributed (needs a block)</em>
              </MenuItem>
              {blocksForTeacher(teacherId.value).map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  {formatBlockOption(b)}
                  {b.label ? ` — ${b.label}` : ''}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>
              Attribute this lesson to one of the teacher’s weekly blocks.
            </FormHelperText>
          </FormControl>
          {blockFitWarning.value && (
            <Alert severity="warning">{blockFitWarning.value}</Alert>
          )}

          <FormControl fullWidth error={!!errorFor('durationMinutes')}>
            <InputLabel id="edit-duration-label">Duration</InputLabel>
            <Select
              labelId="edit-duration-label"
              label="Duration"
              value={durationMinutes.value}
              onChange={(e) =>
                (durationMinutes.value = e.target.value as 30 | 45 | 60)
              }
            >
              {DURATION_OPTIONS.map((d) => (
                <MenuItem key={d} value={d}>
                  {d} minutes
                </MenuItem>
              ))}
            </Select>
            {errorFor('durationMinutes') && (
              <FormHelperText>{errorFor('durationMinutes')}</FormHelperText>
            )}
          </FormControl>

          <FormControl fullWidth>
            <InputLabel id="edit-room-label">Room</InputLabel>
            <Select
              labelId="edit-room-label"
              label="Room"
              value={room.value}
              onChange={(e) => (room.value = e.target.value as Room)}
            >
              {ROOMS.map((r) => (
                <MenuItem key={r} value={r}>
                  {getRoomLabel(r)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="Notes"
            value={notes.value}
            onChange={(e) => (notes.value = e.target.value)}
            multiline
            rows={2}
            fullWidth
            helperText={errorFor('notes') ?? 'Optional'}
            error={!!errorFor('notes')}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Saving...' : 'Update'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
