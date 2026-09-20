'use client';

/**
 * BillingTable — every invoice and card charge for one student, in one table.
 *
 * A lesson is paid for by an invoice, by an automatic charge a billing rule
 * planned (#81), or by a charge a person took on the spot (legacy #864). The student
 * page used to show invoices in one list and charges in a card above it, so
 * "is this family paid up?" meant reading both. The records themselves are
 * untouched; this is only how they are shown together
 * (see `buildBillingRecords`).
 *
 * A block charge is ONE row covering several lessons, with one amount, so four
 * lessons paid in one go never reads as four charges.
 *
 * Settled rows (paid, void, cancelled, waived) are behind a switch, the same
 * way past lessons are: the table is read for what still needs something.
 * A failed charge is never settled — nothing retries it on its own.
 */
import { useMemo, useState, type ReactElement } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SendIcon from '@mui/icons-material/Send';
import BlockIcon from '@mui/icons-material/Block';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  MaterialReactTable,
  useMaterialReactTable,
  type MRT_ColumnDef,
} from 'material-react-table';
import type {
  BillingRecord,
  Invoice,
  InvoicePaymentSource,
  InvoiceStatus,
  Lesson,
  LessonChargeStatus,
  LessonScheduledCharge,
  ManualInvoicePaymentSource,
  RequestState,
} from '@maple/ts/domain';
import {
  BILLING_RECORD_KIND_LABELS,
  buildBillingRecords,
  canStopCharge,
  chargeStatusDetail,
  shortChargeStatus,
  totalCents,
} from '@maple/ts/domain';
import { formatCents } from '@maple/react/lessons';
import { brandTableOptions, BRAND_TABLE_PAGE_SIZE } from '@maple/react/ui';

export interface BillingTableProps {
  invoicesState: RequestState<Invoice[]>;
  chargesState: RequestState<LessonScheduledCharge[]>;
  /** The student's lessons, so a charge can say which dates it covers. */
  lessons: Lesson[];

  onEditInvoice: (invoice: Invoice) => void;
  onSendInvoice: (invoice: Invoice) => void;
  /** Record a payment against a sent invoice, attributed to a manual source
   *  (Venmo witnessed at a lesson, or cash/check/other). */
  onRecordPayment: (
    invoice: Invoice,
    source: ManualInvoicePaymentSource
  ) => void;
  onVoidInvoice: (invoice: Invoice) => void;
  onDeleteInvoice: (invoice: Invoice) => void;

  /** The teaching is not going to happen. */
  onCancelCharge: (chargeId: string) => void;
  /** It happened and the studio is not charging for it. */
  onWaiveCharge: (chargeId: string, reason: string) => void;
  /**
   * Try a failed charge again (legacy #864). Optional, so a read-only view of this
   * table can show failures without offering to move money from a screen
   * nobody is standing in front of.
   *
   * A failed charge is the one state with no stop actions — nothing was
   * collected, so there is nothing to cancel or waive. Without this it is the
   * only row in the table that offers nothing at all, which is backwards: it
   * is the row that most needs acting on.
   */
  onRetryCharge?: (chargeId: string) => void;
  /** Charge whose stop action is in flight. */
  chargePendingId?: string | null;
  /** A failed charge action, shown above the table. */
  error?: string | null;

  /** Omit to hide the "New invoice" button. */
  onNewInvoice?: () => void;
  /** Whether the "Show paid & closed" switch starts on. */
  defaultShowSettled?: boolean;
}

const SHOP_TIME_ZONE = 'America/New_York';

function shortDate(date: Date, withYear = true): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: SHOP_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
  }).format(date);
}

/** Icon + label for the "how was this paid" chip on a paid invoice. */
function paymentAttribution(source: InvoicePaymentSource): {
  icon: ReactElement;
  label: string;
} {
  switch (source) {
    case 'square-webhook':
      return { icon: <CreditCardIcon />, label: 'Paid via Square' };
    case 'venmo-manual':
    case 'venmo-import':
      return { icon: <AccountBalanceWalletIcon />, label: 'Paid via Venmo' };
    case 'square-pos':
      return { icon: <CreditCardIcon />, label: 'Paid in person' };
    case 'admin-manual':
    default:
      return { icon: <PersonOutlineIcon />, label: 'Marked paid manually' };
  }
}

const invoiceStatusColor: Record<
  InvoiceStatus,
  'default' | 'warning' | 'success' | 'info'
> = {
  draft: 'default',
  sent: 'info',
  paid: 'success',
  void: 'warning',
};

const chargeStatusColor: Record<
  LessonChargeStatus,
  'default' | 'warning' | 'success' | 'info' | 'error'
> = {
  scheduled: 'info',
  charging: 'warning',
  paid: 'success',
  failed: 'error',
  cancelled: 'default',
  waived: 'default',
};

interface BillingRow {
  id: string;
  record: BillingRecord;
  dateMs: number;
  typeLabel: string;
  amountCents: number;
}

/** What the date on a row means, in a word. */
function dateCaption(record: BillingRecord): string {
  if (record.kind === 'invoice') {
    const { invoice } = record;
    if (invoice.status === 'paid' && invoice.paidAt) {
      return `Sent · paid ${shortDate(invoice.paidAt, false)}`;
    }
    return invoice.issuedAt ? 'Sent' : 'Drafted';
  }
  return record.charge.status === 'paid' ? 'Charged' : 'Due';
}

/** "4 lessons" plus the span of dates they fall on, when known. */
function CoversCell({
  record,
  lessonsById,
}: {
  record: BillingRecord;
  lessonsById: Map<string, Lesson>;
}) {
  const dates = record.lessonIds
    .map((id) => lessonsById.get(id)?.scheduledAt)
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => a.getTime() - b.getTime());

  let primary: string;
  if (record.lessonIds.length > 0) {
    const n = record.lessonIds.length;
    primary = `${n} lesson${n === 1 ? '' : 's'}`;
  } else if (record.kind === 'invoice') {
    const n = record.invoice.lineItems.length;
    primary = `${n} line${n === 1 ? '' : 's'}`;
  } else {
    primary = '';
  }

  let range = '';
  if (dates.length === 1) range = shortDate(dates[0], false);
  if (dates.length > 1) {
    range = `${shortDate(dates[0], false)} – ${shortDate(
      dates[dates.length - 1],
      false
    )}`;
  }

  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="body2" noWrap sx={{ lineHeight: 1.35 }}>
        {primary}
      </Typography>
      {range && (
        <Typography
          variant="caption"
          color="text.secondary"
          noWrap
          sx={{ display: 'block', lineHeight: 1.35 }}
        >
          {range}
        </Typography>
      )}
    </Box>
  );
}

function StatusCell({ record }: { record: BillingRecord }) {
  if (record.kind === 'invoice') {
    const { invoice } = record;
    const attribution =
      invoice.status === 'paid' && invoice.paymentRecord
        ? paymentAttribution(invoice.paymentRecord.source)
        : null;
    return (
      <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
        <Chip
          label={invoice.status}
          size="small"
          color={invoiceStatusColor[invoice.status]}
          variant={invoice.status === 'paid' ? 'filled' : 'outlined'}
        />
        {attribution && (
          <Chip
            icon={attribution.icon}
            label={attribution.label}
            title={invoice.paymentRecord?.note ?? undefined}
            size="small"
            variant="outlined"
          />
        )}
        {invoice.squareSyncError && (
          <Chip
            icon={<WarningAmberIcon />}
            label="Square sync failed"
            size="small"
            color="error"
            variant="outlined"
            title={invoice.squareSyncError}
          />
        )}
      </Stack>
    );
  }

  const { charge } = record;
  const detail = chargeStatusDetail(charge);
  return (
    <Box sx={{ minWidth: 0 }}>
      <Chip
        label={shortChargeStatus(charge)}
        size="small"
        color={chargeStatusColor[charge.status]}
        variant={charge.status === 'paid' ? 'filled' : 'outlined'}
      />
      {detail && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 0.25, lineHeight: 1.35 }}
        >
          {detail}
        </Typography>
      )}
    </Box>
  );
}

function InvoiceActions({
  invoice,
  onEdit,
  onSend,
  onRecordPayment,
  onVoid,
  onDelete,
}: {
  invoice: Invoice;
  onEdit: () => void;
  onSend: () => void;
  onRecordPayment: (source: ManualInvoicePaymentSource) => void;
  onVoid: () => void;
  onDelete: () => void;
}) {
  const { status } = invoice;
  const isDraft = status === 'draft';
  const isSent = status === 'sent';
  const isTerminal = status === 'paid' || status === 'void';

  // Anchor for the "mark paid" method menu (Venmo vs. cash/check/other).
  const [payMenuAnchor, setPayMenuAnchor] = useState<HTMLElement | null>(null);
  const closePayMenu = () => setPayMenuAnchor(null);
  const recordAndClose = (source: ManualInvoicePaymentSource) => {
    closePayMenu();
    onRecordPayment(source);
  };

  return (
    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
      {isDraft && (
        <Tooltip title="Send">
          <IconButton
            onClick={onSend}
            size="small"
            aria-label="Send invoice"
            color="info"
          >
            <SendIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {isSent && (
        <>
          <Tooltip title="Mark paid">
            <IconButton
              onClick={(e) => setPayMenuAnchor(e.currentTarget)}
              size="small"
              aria-label="Mark invoice paid"
              aria-haspopup="menu"
              color="success"
            >
              <MonetizationOnIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={payMenuAnchor}
            open={!!payMenuAnchor}
            onClose={closePayMenu}
          >
            <MenuItem onClick={() => recordAndClose('venmo-manual')}>
              <AccountBalanceWalletIcon fontSize="small" sx={{ mr: 1 }} />
              Paid via Venmo
            </MenuItem>
            <MenuItem onClick={() => recordAndClose('admin-manual')}>
              <PersonOutlineIcon fontSize="small" sx={{ mr: 1 }} />
              Cash, check, or other
            </MenuItem>
          </Menu>
        </>
      )}
      {!isTerminal && (
        <Tooltip title="Edit">
          <IconButton onClick={onEdit} size="small" aria-label="Edit invoice">
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {(isDraft || isSent || status === 'paid') && (
        <Tooltip title="Void">
          <IconButton
            onClick={onVoid}
            size="small"
            aria-label="Void invoice"
            color="warning"
          >
            <BlockIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {isDraft && (
        <Tooltip title="Delete draft">
          <IconButton
            onClick={onDelete}
            size="small"
            aria-label="Delete invoice"
            color="error"
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}

export function BillingTable({
  invoicesState,
  chargesState,
  lessons,
  onEditInvoice,
  onSendInvoice,
  onRecordPayment,
  onVoidInvoice,
  onDeleteInvoice,
  onCancelCharge,
  onWaiveCharge,
  onRetryCharge,
  chargePendingId = null,
  error = null,
  onNewInvoice,
  defaultShowSettled = false,
}: BillingTableProps) {
  const [showSettled, setShowSettled] = useState(defaultShowSettled);
  const [waiving, setWaiving] = useState<LessonScheduledCharge | null>(null);
  const [reason, setReason] = useState('');

  const invoices = useMemo(
    () => (invoicesState.status === 'success' ? invoicesState.data : []),
    [invoicesState]
  );
  const charges = useMemo(
    () => (chargesState.status === 'success' ? chargesState.data : []),
    [chargesState]
  );

  const lessonsById = useMemo(
    () => new Map(lessons.map((l) => [l.id, l])),
    [lessons]
  );

  const allRows = useMemo<BillingRow[]>(
    () =>
      buildBillingRecords(invoices, charges).map((record) => ({
        id: `${record.kind}:${record.id}`,
        record,
        dateMs: record.date.getTime(),
        typeLabel: BILLING_RECORD_KIND_LABELS[record.kind],
        amountCents: record.amountCents,
      })),
    [invoices, charges]
  );

  const rows = useMemo(
    () => (showSettled ? allRows : allRows.filter((r) => !r.record.isSettled)),
    [allRows, showSettled]
  );
  const hiddenSettledCount = allRows.length - rows.length;

  const failed = useMemo(
    () => charges.filter((c) => c.status === 'failed'),
    [charges]
  );

  const columns = useMemo<MRT_ColumnDef<BillingRow>[]>(
    () => [
      {
        accessorKey: 'dateMs',
        header: 'Date',
        size: 170,
        Cell: ({ row }) => (
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="body2"
              noWrap
              sx={{ fontWeight: 500, lineHeight: 1.35 }}
            >
              {shortDate(row.original.record.date)}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              noWrap
              sx={{ display: 'block', lineHeight: 1.35 }}
            >
              {dateCaption(row.original.record)}
            </Typography>
          </Box>
        ),
      },
      {
        accessorKey: 'typeLabel',
        header: 'Type',
        size: 170,
      },
      {
        accessorKey: 'amountCents',
        header: 'Amount',
        size: 120,
        // Left-aligned on purpose: a right-aligned header puts its sort and
        // menu icons on the left, where they read as belonging to Type.
        Cell: ({ row }) => (
          <Typography
            variant="body2"
            sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
          >
            {formatCents(row.original.amountCents)}
          </Typography>
        ),
      },
      {
        id: 'covers',
        header: 'Covers',
        size: 170,
        enableSorting: false,
        Cell: ({ row }) => (
          <CoversCell record={row.original.record} lessonsById={lessonsById} />
        ),
      },
      {
        id: 'status',
        accessorFn: (row) =>
          row.record.kind === 'invoice'
            ? row.record.invoice.status
            : row.record.charge.status,
        header: 'Status',
        size: 260,
        Cell: ({ row }) => <StatusCell record={row.original.record} />,
      },
      {
        id: 'actions',
        header: 'Actions',
        size: 180,
        enableSorting: false,
        enableColumnActions: false,
        muiTableBodyCellProps: { align: 'right' },
        muiTableHeadCellProps: { align: 'right' },
        Cell: ({ row }) => {
          const { record } = row.original;
          if (record.kind === 'invoice') {
            const { invoice } = record;
            return (
              <InvoiceActions
                invoice={invoice}
                onEdit={() => onEditInvoice(invoice)}
                onSend={() => onSendInvoice(invoice)}
                onRecordPayment={(source) => onRecordPayment(invoice, source)}
                onVoid={() => onVoidInvoice(invoice)}
                onDelete={() => onDeleteInvoice(invoice)}
              />
            );
          }
          const { charge } = record;
          const busy = chargePendingId === charge.id;

          if (charge.status === 'failed') {
            if (!onRetryCharge) return null;
            return (
              <Stack
                direction="row"
                spacing={1}
                sx={{ justifyContent: 'flex-end' }}
              >
                <Button
                  size="small"
                  variant="outlined"
                  disabled={busy}
                  aria-label="Retry charge"
                  onClick={() => onRetryCharge(charge.id)}
                >
                  Try again
                </Button>
              </Stack>
            );
          }

          if (!canStopCharge(charge)) return null;
          return (
            <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
              <Button
                size="small"
                disabled={busy}
                aria-label="Waive charge"
                onClick={() => {
                  setReason('');
                  setWaiving(charge);
                }}
              >
                Waive
              </Button>
              <Button
                size="small"
                color="inherit"
                disabled={busy}
                aria-label="Cancel charge"
                onClick={() => onCancelCharge(charge.id)}
              >
                Cancel
              </Button>
            </Stack>
          );
        },
      },
    ],
    [
      lessonsById,
      onEditInvoice,
      onSendInvoice,
      onRecordPayment,
      onVoidInvoice,
      onDeleteInvoice,
      onCancelCharge,
      onRetryCharge,
      chargePendingId,
    ]
  );

  const isLoading =
    invoicesState.status === 'loading' || chargesState.status === 'loading';

  const table = useMaterialReactTable({
    ...brandTableOptions<BillingRow>(),
    columns,
    data: rows,
    getRowId: (row) => row.id,
    state: { isLoading },
    enableColumnPinning: true,
    initialState: {
      // Oldest first, matching the lessons table: what is due soonest is on
      // top while settled rows are hidden.
      sorting: [{ id: 'dateMs', desc: false }],
      columnPinning: { left: ['dateMs'], right: ['actions'] },
      pagination: { pageIndex: 0, pageSize: BRAND_TABLE_PAGE_SIZE },
      density: 'comfortable',
    },
    renderTopToolbarCustomActions: () => (
      <Stack
        direction="row"
        spacing={2}
        sx={{ alignItems: 'center', flexWrap: 'wrap', ml: 0.5 }}
      >
        <FormControlLabel
          control={
            <Switch
              checked={showSettled}
              onChange={(e) => setShowSettled(e.target.checked)}
            />
          }
          label={
            showSettled || hiddenSettledCount === 0
              ? 'Show paid & closed'
              : `Show paid & closed (${hiddenSettledCount})`
          }
        />
        {onNewInvoice && (
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={onNewInvoice}
          >
            New invoice
          </Button>
        )}
      </Stack>
    ),
    renderEmptyRowsFallback: () => (
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ py: 4, textAlign: 'center', width: '100%' }}
      >
        {allRows.length === 0
          ? 'No invoices or charges yet. Lessons are charged automatically once a student is on a billing rule and has a card on file.'
          : 'Nothing outstanding. Turn on “Show paid & closed” to see history.'}
      </Typography>
    ),
  });

  const loadError =
    invoicesState.status === 'error'
      ? `Failed to load invoices: ${invoicesState.error}`
      : chargesState.status === 'error'
        ? `Failed to load charges: ${chargesState.error}`
        : null;

  if (invoicesState.status === 'idle' && chargesState.status === 'idle') {
    return null;
  }

  return (
    <Box>
      {(error ?? loadError) && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error ?? loadError}
        </Alert>
      )}

      {failed.length > 0 && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {failed.length} charge{failed.length === 1 ? '' : 's'} failed,
          totalling {formatCents(totalCents(failed))}. Nothing retries on its
          own, so these need chasing by hand.
        </Alert>
      )}

      <MaterialReactTable table={table} />

      <Dialog
        open={!!waiving}
        onClose={() => setWaiving(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Waive this charge</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            The lessons stay on the books and nothing is charged for them. Say
            why, so the comped block still makes sense later.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Makeup for a lesson we cancelled"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWaiving(null)}>Back</Button>
          <Button
            variant="contained"
            disabled={!reason.trim()}
            onClick={() => {
              if (waiving) onWaiveCharge(waiving.id, reason.trim());
              setWaiving(null);
            }}
          >
            Waive {waiving ? formatCents(waiving.amountCents) : ''}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
