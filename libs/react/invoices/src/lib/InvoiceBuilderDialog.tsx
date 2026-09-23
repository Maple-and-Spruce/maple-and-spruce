'use client';

/**
 * InvoiceBuilderDialog — create or edit a private-pay invoice.
 *
 * Signals idiom (matches post-#287 pattern): `useSignals()` runtime hook,
 * `useSignal` per line-items array + notes, `useComputed` for the
 * Vest validation + totals. The server is authoritative for totalCents;
 * the dialog shows a live preview but doesn't submit that value.
 */

import { useCallback, useEffect } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Popover,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EventNoteIcon from '@mui/icons-material/EventNote';
import type {
  CreateInvoiceInput,
  Invoice,
  InvoiceLineItem,
  Lesson,
  LessonScheduledCharge,
  UpdateInvoiceInput,
} from '@maple/ts/domain';
import {
  computeInvoiceTotalCents,
  computeLineSubtotal,
  describeLessonBillingState,
  describeLessonLine,
  canStillBillLesson,
  lessonBillingState,
  SCHEDULE_TIME_ZONE,
} from '@maple/ts/domain';
import { invoiceValidation } from '@maple/ts/validation';
import { formatCents } from '@maple/react/lessons';
import {
  batch,
  useComputed,
  useSignal,
  useSignals,
} from '@maple/react/signals';

interface InvoiceBuilderDialogProps {
  open: boolean;
  onClose: () => void;
  studentId: string;
  /** Provide to edit an existing invoice; omit for create mode. */
  invoice?: Invoice;
  /** Past lessons for the "Add from lesson" picker. */
  lessons: Lesson[];
  /**
   * The student's card charges and invoices, so the picker can say which
   * lessons are already spoken for instead of offering a second ask for the
   * same teaching (#110). Optional and empty-by-default: a caller that has not
   * loaded them gets today's behaviour rather than a crash.
   */
  charges?: LessonScheduledCharge[];
  invoices?: Invoice[];
  onCreate: (input: CreateInvoiceInput) => Promise<unknown>;
  onUpdate: (input: UpdateInvoiceInput) => Promise<unknown>;
  isSubmitting?: boolean;
}

/**
 * Stable client-side id for a line, so an edit can target the right one.
 *
 * Exported because the student page builds a one-line invoice of its own when
 * a taught lesson has not been billed (#101), and two id schemes for the same
 * field is how they drift apart.
 */
export function newInvoiceLineId(): string {
  const cryptoObj: { randomUUID?: () => string } =
    (globalThis as unknown as { crypto?: { randomUUID?: () => string } })
      .crypto ?? {};
  if (typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * When the lesson was, for a picker row. The shop's timezone, like every other
 * lesson date on screen — this row used to format in the machine's.
 */
function lessonPickerWhen(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: SCHEDULE_TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function blankLine(): InvoiceLineItem {
  return {
    id: newInvoiceLineId(),
    description: '',
    quantity: 1,
    unitAmountCents: 0,
    subtotalCents: 0,
  };
}

/**
 * The line still arrives at $0 for a human to price — #106 — but the wording and
 * the day now come from `describeLessonLine`, the one description shared with
 * the commit card and the taught-lesson offer (#113). It formatted the date in
 * the *machine's* timezone before, so an admin a timezone west of the studio
 * raised invoices naming the previous day for an evening lesson.
 */
function lineFromLesson(lesson: Lesson): InvoiceLineItem {
  return {
    id: newInvoiceLineId(),
    description: describeLessonLine(lesson),
    lessonId: lesson.id,
    quantity: 1,
    unitAmountCents: 0,
    subtotalCents: 0,
  };
}

export function InvoiceBuilderDialog({
  open,
  onClose,
  studentId,
  invoice,
  lessons,
  charges = [],
  invoices = [],
  onCreate,
  onUpdate,
  isSubmitting = false,
}: InvoiceBuilderDialogProps) {
  useSignals();

  const lineItems = useSignal<InvoiceLineItem[]>([]);
  const notes = useSignal('');
  const showValidationErrors = useSignal(false);
  const submitError = useSignal<string | null>(null);
  const pickerAnchor = useSignal<HTMLElement | null>(null);
  const pickerSelected = useSignal<Record<string, boolean>>({});

  const isEdit = !!invoice;

  // Reset state when the dialog opens / target invoice changes.
  useEffect(() => {
    if (!open) return;
    batch(() => {
      if (invoice) {
        lineItems.value = invoice.lineItems.map((line) => ({ ...line }));
        notes.value = invoice.notes ?? '';
      } else {
        lineItems.value = [blankLine()];
        notes.value = '';
      }
      showValidationErrors.value = false;
      submitError.value = null;
      pickerAnchor.value = null;
      pickerSelected.value = {};
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoice]);

  const validation = useComputed(() =>
    invoiceValidation({
      studentId,
      lineItems: lineItems.value,
      notes: notes.value || undefined,
    })
  );

  const totalCents = useComputed(() =>
    computeInvoiceTotalCents(lineItems.value)
  );

  const errorFor = (field: string): string | null => {
    if (!showValidationErrors.value) return null;
    const errs = validation.value.getErrors(field);
    return errs?.[0] ?? null;
  };

  const updateLine = (id: string, patch: Partial<InvoiceLineItem>) => {
    lineItems.value = lineItems.value.map((line) =>
      line.id === id
        ? {
            ...line,
            ...patch,
            subtotalCents: computeLineSubtotal({
              quantity: patch.quantity ?? line.quantity,
              unitAmountCents: patch.unitAmountCents ?? line.unitAmountCents,
            }),
          }
        : line
    );
  };

  const removeLine = (id: string) => {
    lineItems.value = lineItems.value.filter((line) => line.id !== id);
  };

  const addBlankLine = () => {
    lineItems.value = [...lineItems.value, blankLine()];
  };

  const insertLinesFromLessons = () => {
    const picks = Object.entries(pickerSelected.value)
      .filter(([, v]) => v)
      .map(([id]) => lessons.find((l) => l.id === id))
      .filter((l): l is Lesson => !!l);
    if (picks.length === 0) return;
    lineItems.value = [...lineItems.value, ...picks.map(lineFromLesson)];
    batch(() => {
      pickerAnchor.value = null;
      pickerSelected.value = {};
    });
  };

  const handleSubmit = useCallback(async () => {
    showValidationErrors.value = true;
    if (!validation.value.isValid()) return;
    if (isSubmitting) return;

    submitError.value = null;
    try {
      if (invoice) {
        await onUpdate({
          id: invoice.id,
          lineItems: lineItems.value,
          notes: notes.value || undefined,
        });
      } else {
        await onCreate({
          studentId,
          lineItems: lineItems.value,
          notes: notes.value || undefined,
        });
      }
      onClose();
    } catch (error: unknown) {
      submitError.value =
        error instanceof Error ? error.message : 'Failed to save invoice';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice, isSubmitting, onCreate, onUpdate, onClose, studentId]);

  /**
   * Every choosable lesson with what already bills it, newest first.
   *
   * The picker used to list every lesson flat, so a lesson already covered by a
   * `paid` charge could be invoiced again — the same double-ask #101 fixed on
   * the charge side, in the other direction (#110). A billed lesson stays
   * visible and says why rather than disappearing, because a date vanishing
   * from the list is its own kind of confusing.
   */
  const eligibleLessons = lessons
    .filter((l) => l.status !== 'cancelled')
    .sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime())
    .map((lesson) => {
      // Already a line on the invoice being built? That is the live draft, and
      // it outranks the saved copy — a line removed a moment ago must become
      // choosable again rather than staying blocked by its own invoice.
      if (lineItems.value.some((line) => line.lessonId === lesson.id)) {
        return { lesson, billed: true, billedBecause: 'Already a line below' };
      }
      // Everything else the student has, except the invoice being edited: its
      // saved lines are stale the moment the draft above diverges from them.
      const state = lessonBillingState(
        lesson.id,
        charges,
        invoices.filter((i) => i.id !== invoice?.id)
      );
      return {
        lesson,
        billed: !canStillBillLesson(state),
        billedBecause: describeLessonBillingState(state),
      };
    });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{isEdit ? 'Edit invoice' : 'New invoice'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {submitError.value && (
            <Alert severity="error" onClose={() => (submitError.value = null)}>
              {submitError.value}
            </Alert>
          )}

          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 1,
            }}
          >
            <Typography variant="overline" color="text.secondary">
              Line items
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={addBlankLine}
              >
                Add line
              </Button>
              <Button
                size="small"
                startIcon={<EventNoteIcon />}
                onClick={(e) => {
                  pickerAnchor.value = e.currentTarget;
                }}
                disabled={eligibleLessons.length === 0}
              >
                Add from lesson
              </Button>
            </Stack>
          </Box>

          {showValidationErrors.value && errorFor('lineItems') && (
            <Alert severity="error">{errorFor('lineItems')}</Alert>
          )}

          {lineItems.value.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No line items yet. Click &quot;Add line&quot; or &quot;Add from
              lesson&quot; to start.
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {lineItems.value.map((line) => (
                <Box
                  key={line.id}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 80px 110px 90px 40px',
                    gap: 1,
                    alignItems: 'start',
                  }}
                >
                  <TextField
                    label="Description"
                    size="small"
                    value={line.description}
                    onChange={(e) =>
                      updateLine(line.id, { description: e.target.value })
                    }
                    required
                    fullWidth
                  />
                  <TextField
                    label="Qty"
                    size="small"
                    type="number"
                    value={line.quantity}
                    onChange={(e) => {
                      const n = parseFloat(e.target.value);
                      updateLine(line.id, {
                        quantity: Number.isFinite(n) ? n : 0,
                      });
                    }}
                    inputProps={{ min: 0, step: '0.5' }}
                  />
                  <TextField
                    label="Rate"
                    size="small"
                    type="number"
                    value={(line.unitAmountCents / 100).toString()}
                    onChange={(e) => {
                      const n = parseFloat(e.target.value);
                      updateLine(line.id, {
                        unitAmountCents: Number.isFinite(n)
                          ? Math.round(n * 100)
                          : 0,
                      });
                    }}
                    inputProps={{ min: 0, step: '0.01' }}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">$</InputAdornment>
                      ),
                    }}
                  />
                  <TextField
                    label="Subtotal"
                    size="small"
                    value={formatCents(line.subtotalCents)}
                    InputProps={{ readOnly: true }}
                  />
                  <IconButton
                    size="small"
                    aria-label={`Remove line: ${line.description || 'blank'}`}
                    onClick={() => removeLine(line.id)}
                    sx={{ alignSelf: 'center' }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
            </Box>
          )}

          <Divider />

          <Box
            sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}
          >
            <Typography variant="overline" color="text.secondary">
              Total
            </Typography>
            <Typography variant="h6">
              {formatCents(totalCents.value)}
            </Typography>
          </Box>

          <TextField
            label="Internal notes"
            value={notes.value}
            onChange={(e) => (notes.value = e.target.value)}
            multiline
            rows={2}
            fullWidth
            error={!!errorFor('notes')}
            helperText={
              errorFor('notes') ?? 'Optional — not shown to the parent'
            }
          />
        </Box>

        <Popover
          open={!!pickerAnchor.value}
          anchorEl={pickerAnchor.value}
          onClose={() => (pickerAnchor.value = null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <Box sx={{ p: 2, minWidth: 280, maxHeight: 320, overflowY: 'auto' }}>
            <Typography variant="overline" sx={{ display: 'block', mb: 1 }}>
              Add lessons as lines
            </Typography>
            {eligibleLessons.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No lessons to choose from.
              </Typography>
            ) : (
              <>
                {eligibleLessons.map(({ lesson, billed, billedBecause }) => (
                  <FormControlLabel
                    key={lesson.id}
                    disabled={billed}
                    control={
                      <Checkbox
                        checked={!!pickerSelected.value[lesson.id]}
                        onChange={(e) => {
                          pickerSelected.value = {
                            ...pickerSelected.value,
                            [lesson.id]: e.target.checked,
                          };
                        }}
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body2">
                          {lessonPickerWhen(lesson.scheduledAt)}
                          {' · '}
                          {lesson.durationMinutes} min
                          {' · '}
                          {lesson.status}
                        </Typography>
                        {billedBecause && (
                          <Typography variant="caption" color="text.secondary">
                            {billedBecause}
                          </Typography>
                        )}
                      </Box>
                    }
                    sx={{ display: 'flex', mb: 0.25 }}
                  />
                ))}
                <Divider sx={{ my: 1 }} />
                <Button
                  size="small"
                  variant="contained"
                  fullWidth
                  onClick={insertLinesFromLessons}
                  disabled={
                    Object.values(pickerSelected.value).filter(Boolean)
                      .length === 0
                  }
                >
                  Add selected
                </Button>
              </>
            )}
          </Box>
        </Popover>
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
          {isSubmitting
            ? 'Saving...'
            : isEdit
              ? 'Save changes'
              : 'Create draft'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
