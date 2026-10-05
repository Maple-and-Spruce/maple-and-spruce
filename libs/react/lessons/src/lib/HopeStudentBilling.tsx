'use client';

/**
 * One Hope student's billing, in the order Katie works it (WV Hope Scholarship).
 *
 *   1. Record the family's EMA order when it arrives (a block of lessons).
 *   2. Lessons that are taught draw that order down, oldest first, on their own.
 *   3. Invoice the ones that are ready in the EMA portal, then tick them off here.
 *
 * Taught lessons with no order to go against are shown as needing one, because
 * the portal cannot invoice them until the family orders more, and that is the
 * thing most likely to stall without anyone noticing.
 *
 * The same card sits on the student's page and, once per student, on the Hope
 * Billing page, so there is one way to do this rather than two.
 */
import { useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import type {
  HopeOrder,
  HopeProduct,
  HopeQueueEntry,
  SaveHopeOrderInput,
} from '@maple/ts/domain';
import { SCHEDULE_TIME_ZONE, formatHopePrice } from '@maple/ts/domain';
import { hopeOrderValidation } from '@maple/ts/validation';

export interface HopeOrderRow extends HopeOrder {
  /** Lessons this order still has room for. */
  remaining: number;
}

export type SaveHopeOrderDraft = Omit<SaveHopeOrderInput, 'studentId'>;

export interface HopeStudentBillingProps {
  /** Shown as a heading linking to the student, on the Hope Billing page. */
  studentName?: string;
  studentHref?: string;
  /** This student's taught lessons, with their state. */
  entries: HopeQueueEntry[];
  /** This student's EMA orders, oldest first. */
  orders: HopeOrderRow[];
  products: HopeProduct[];
  /** The student's EMA product, the default for a new order. */
  defaultProductId?: string;
  /** Lesson ids being written right now. */
  recording?: ReadonlySet<string>;
  isSavingOrder?: boolean;
  onSaveOrder: (input: SaveHopeOrderDraft) => Promise<unknown>;
  onMarkInvoiced: (lessonIds: string[], emaReference?: string) => Promise<unknown>;
}

function day(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: SCHEDULE_TIME_ZONE,
  });
}

/** yyyy-mm-dd for a date input, in the studio's timezone. */
function dateInputValue(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: SCHEDULE_TIME_ZONE });
}

function OrderDialog({
  initial,
  products,
  isSaving,
  onClose,
  onSave,
}: {
  initial: SaveHopeOrderDraft;
  products: HopeProduct[];
  isSaving: boolean;
  onClose: () => void;
  onSave: (input: SaveHopeOrderDraft) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState({
    ...initial,
    lessonCount: String(initial.lessonCount),
    orderedOn: dateInputValue(initial.orderedOn),
  });
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const input: SaveHopeOrderDraft = {
    id: draft.id,
    productId: draft.productId,
    lessonCount: Number(draft.lessonCount),
    emaOrderId: draft.emaOrderId?.trim() || undefined,
    // Noon, so the date reads the same in every timezone it is shown in.
    orderedOn: new Date(`${draft.orderedOn}T12:00:00`),
  };
  const result = hopeOrderValidation({ ...input, studentId: 'x' });
  const fieldError = (field: string) =>
    showErrors ? result.getErrors(field)[0] : undefined;

  const offered = products.filter(
    (p) => p.active || p.id === draft.productId
  );

  const submit = async () => {
    setShowErrors(true);
    if (result.hasErrors()) return;
    setError(null);
    try {
      await onSave(input);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the order');
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{initial.id ? 'Edit EMA order' : 'Record an EMA order'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="textSecondary">
            From Purchases in the EMA portal. Taught lessons are invoiced
            against it oldest first.
          </Typography>
          <TextField
            select
            label="EMA product"
            value={draft.productId}
            onChange={(e) => setDraft({ ...draft, productId: e.target.value })}
            error={Boolean(fieldError('productId'))}
            helperText={
              fieldError('productId') ??
              (offered.length === 0
                ? 'Add the EMA products on the Hope Billing page first.'
                : undefined)
            }
          >
            {offered.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name} · {formatHopePrice(p.priceCents)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Number of lessons"
            type="number"
            value={draft.lessonCount}
            onChange={(e) => setDraft({ ...draft, lessonCount: e.target.value })}
            error={Boolean(fieldError('lessonCount'))}
            helperText={fieldError('lessonCount')}
            slotProps={{ htmlInput: { min: 1, step: 1 } }}
          />
          <TextField
            label="Ordered on"
            type="date"
            value={draft.orderedOn}
            onChange={(e) => setDraft({ ...draft, orderedOn: e.target.value })}
            error={Boolean(fieldError('orderedOn'))}
            helperText={fieldError('orderedOn')}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="EMA order ID (optional)"
            value={draft.emaOrderId ?? ''}
            onChange={(e) => setDraft({ ...draft, emaOrderId: e.target.value })}
          />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save order'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function HopeStudentBilling({
  studentName,
  studentHref,
  entries,
  orders,
  products,
  defaultProductId,
  recording = new Set(),
  isSavingOrder = false,
  onSaveOrder,
  onMarkInvoiced,
}: HopeStudentBillingProps) {
  const [editing, setEditing] = useState<SaveHopeOrderDraft | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [reference, setReference] = useState('');
  const [showInvoiced, setShowInvoiced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byDate = (a: HopeQueueEntry, b: HopeQueueEntry) =>
    a.lesson.scheduledAt.getTime() - b.lesson.scheduledAt.getTime();
  const ready = entries
    .filter((e) => e.state?.kind === 'ready-to-invoice')
    .sort(byDate);
  const needsOrder = entries
    .filter((e) => !e.state || e.state.kind === 'needs-order')
    .sort(byDate);
  const invoiced = entries
    .filter((e) => e.state?.kind === 'invoiced')
    .sort(byDate);

  const toggle = (lessonId: string) =>
    setPicked((current) =>
      current.includes(lessonId)
        ? current.filter((id) => id !== lessonId)
        : [...current, lessonId]
    );
  const pickedReady = picked.filter((id) => ready.some((e) => e.lesson.id === id));
  const pickedCents = ready
    .filter((e) => pickedReady.includes(e.lesson.id))
    .reduce((sum, e) => sum + e.rateCents, 0);
  const busy = recording.size > 0;

  const newOrder = () =>
    setEditing({
      productId:
        defaultProductId ?? products.find((p) => p.active)?.id ?? '',
      lessonCount: 4,
      orderedOn: new Date(),
    });

  const markInvoiced = async () => {
    setError(null);
    try {
      await onMarkInvoiced(pickedReady, reference.trim() || undefined);
      setPicked([]);
      setReference('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mark them invoiced');
    }
  };

  const orderLabel = (orderId?: string) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return undefined;
    return order.emaOrderId ? `order ${order.emaOrderId}` : `order of ${day(order.orderedOn)}`;
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: 'center',
          mb: 1.5,
          flexWrap: 'wrap',
          rowGap: 1
        }}>
        <Typography variant="h6" component="h2" sx={{ flexGrow: 1 }}>
          {studentName && studentHref ? (
            <Link href={studentHref} style={{ color: 'inherit' }}>
              {studentName}
            </Link>
          ) : (
            studentName ?? 'Hope billing'
          )}
        </Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={newOrder}>
          Record an order
        </Button>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }}>
        <Chip
          size="small"
          color={ready.length > 0 ? 'primary' : 'default'}
          label={`${ready.length} ready to invoice`}
        />
        <Chip
          size="small"
          color={needsOrder.length > 0 ? 'warning' : 'default'}
          label={`${needsOrder.length} need an order`}
        />
        <Chip size="small" variant="outlined" label={`${invoiced.length} invoiced`} />
      </Stack>
      {/* The orders, so "why can't I invoice this" answers itself. */}
      {orders.length > 0 ? (
        <Stack spacing={0.25} sx={{ mb: 2 }}>
          {orders.map((order) => (
            <Stack key={order.id} direction="row" spacing={1} sx={{
              alignItems: 'center'
            }}>
              <Typography variant="body2" sx={{ flexGrow: 1 }}>
                {order.emaOrderId ? `Order ${order.emaOrderId}` : 'Order'} ·{' '}
                {order.lessonCount} lessons · {day(order.orderedOn)} ·{' '}
                <strong>{order.remaining} left</strong>
              </Typography>
              <Tooltip title="Edit order">
                <IconButton
                  size="small"
                  aria-label={`Edit the order of ${day(order.orderedOn)}`}
                  onClick={() =>
                    setEditing({
                      id: order.id,
                      productId: order.productId,
                      lessonCount: order.lessonCount,
                      emaOrderId: order.emaOrderId,
                      orderedOn: order.orderedOn,
                    })
                  }
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          ))}
        </Stack>
      ) : (
        <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
          No EMA orders recorded yet.
        </Typography>
      )}
      {needsOrder.length > 0 && (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={
            <Button size="small" onClick={newOrder}>
              Record an order
            </Button>
          }
        >
          {needsOrder.length === 1
            ? '1 taught lesson needs an EMA order before it can be invoiced'
            : `${needsOrder.length} taught lessons need an EMA order before they can be invoiced`}
          : {needsOrder.map((e) => day(e.lesson.scheduledAt)).join(', ')}.
        </Alert>
      )}
      {ready.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Stack
            direction="row"
            sx={{
              alignItems: 'center',
              mb: 0.5
            }}>
            <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
              Ready to invoice in the EMA portal
            </Typography>
            {ready.length > 1 && (
              <Button
                size="small"
                onClick={() =>
                  setPicked(
                    pickedReady.length === ready.length
                      ? []
                      : ready.map((e) => e.lesson.id)
                  )
                }
              >
                {pickedReady.length === ready.length ? 'Untick all' : `Tick all ${ready.length}`}
              </Button>
            )}
          </Stack>
          <Stack>
            {ready.map((entry) => (
              <FormControlLabel
                key={entry.lesson.id}
                control={
                  <Checkbox
                    size="small"
                    checked={pickedReady.includes(entry.lesson.id)}
                    disabled={busy}
                    onChange={() => toggle(entry.lesson.id)}
                  />
                }
                label={
                  <Typography variant="body2">
                    {day(entry.lesson.scheduledAt)} ·{' '}
                    {formatHopePrice(entry.rateCents)}
                    {entry.state?.kind === 'ready-to-invoice' &&
                      orderLabel(entry.state.orderId) &&
                      ` · ${orderLabel(entry.state.orderId)}`}
                  </Typography>
                }
              />
            ))}
          </Stack>
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: 'center',
              mt: 1,
              flexWrap: 'wrap',
              rowGap: 1
            }}>
            <TextField
              size="small"
              label="EMA invoice # (optional)"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              sx={{ minWidth: 230 }}
            />
            <Button
              variant="contained"
              disabled={pickedReady.length === 0 || busy}
              onClick={markInvoiced}
            >
              {busy
                ? 'Saving…'
                : pickedReady.length === 0
                  ? 'Mark invoiced'
                  : `Mark ${pickedReady.length} invoiced (${formatHopePrice(pickedCents)})`}
            </Button>
          </Stack>
        </Box>
      )}
      {entries.length === 0 && (
        <Typography variant="body2" color="textSecondary">
          No taught lessons yet. Marking a lesson taught puts it here.
        </Typography>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {invoiced.length > 0 && (
        <>
          <Button size="small" onClick={() => setShowInvoiced((v) => !v)}>
            {showInvoiced ? 'Hide invoiced' : `Show ${invoiced.length} invoiced`}
          </Button>
          <Collapse in={showInvoiced}>
            <Stack spacing={0.25} sx={{ mt: 1 }}>
              {invoiced.map((entry) => (
                <Typography
                  key={entry.lesson.id}
                  variant="body2"
                  color="textSecondary"
                >
                  {day(entry.lesson.scheduledAt)} ·{' '}
                  {formatHopePrice(entry.submission?.rateCents ?? entry.rateCents)}
                  {entry.submission?.emaReference &&
                    ` · invoice ${entry.submission.emaReference}`}
                </Typography>
              ))}
            </Stack>
          </Collapse>
        </>
      )}
      {editing && (
        <OrderDialog
          initial={editing}
          products={products}
          isSaving={isSavingOrder}
          onClose={() => setEditing(null)}
          onSave={onSaveOrder}
        />
      )}
    </Paper>
  );
}
