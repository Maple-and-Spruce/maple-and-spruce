'use client';

import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Skeleton,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SendIcon from '@mui/icons-material/Send';
import BlockIcon from '@mui/icons-material/Block';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import type {
  Invoice,
  InvoiceStatus,
  RequestState,
} from '@maple/ts/domain';
import { formatCents } from '@maple/react/lessons';

interface InvoiceListProps {
  invoicesState: RequestState<Invoice[]>;
  onEdit: (invoice: Invoice) => void;
  onSend: (invoice: Invoice) => void;
  onMarkPaid: (invoice: Invoice) => void;
  onVoid: (invoice: Invoice) => void;
  onDelete: (invoice: Invoice) => void;
}

const statusColor: Record<
  InvoiceStatus,
  'default' | 'warning' | 'success' | 'info'
> = {
  draft: 'default',
  sent: 'info',
  paid: 'success',
  void: 'warning',
};

function formatDate(d?: Date): string {
  if (!d) return '—';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function InvoiceRow({
  invoice,
  onEdit,
  onSend,
  onMarkPaid,
  onVoid,
  onDelete,
}: {
  invoice: Invoice;
  onEdit: () => void;
  onSend: () => void;
  onMarkPaid: () => void;
  onVoid: () => void;
  onDelete: () => void;
}) {
  const { status } = invoice;
  const isDraft = status === 'draft';
  const isSent = status === 'sent';
  const isTerminal = status === 'paid' || status === 'void';

  return (
    <ListItem
      sx={{
        borderBottom: '1px solid',
        borderColor: 'divider',
        gap: 1,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
      secondaryAction={
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {isDraft && (
            <IconButton
              onClick={onSend}
              size="small"
              aria-label="Send invoice"
              color="info"
            >
              <SendIcon fontSize="small" />
            </IconButton>
          )}
          {isSent && (
            <IconButton
              onClick={onMarkPaid}
              size="small"
              aria-label="Mark invoice paid"
              color="success"
            >
              <MonetizationOnIcon fontSize="small" />
            </IconButton>
          )}
          {!isTerminal && (
            <IconButton
              onClick={onEdit}
              size="small"
              aria-label="Edit invoice"
            >
              <EditIcon fontSize="small" />
            </IconButton>
          )}
          {(isDraft || isSent || status === 'paid') && (
            <IconButton
              onClick={onVoid}
              size="small"
              aria-label="Void invoice"
              color="warning"
            >
              <BlockIcon fontSize="small" />
            </IconButton>
          )}
          {isDraft && (
            <IconButton
              onClick={onDelete}
              size="small"
              aria-label="Delete invoice"
              color="error"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      }
    >
      <ListItemText
        primary={
          <Box
            sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}
          >
            <Typography variant="body1" component="span">
              {formatCents(invoice.totalCents)}
            </Typography>
            <Chip
              label={status}
              size="small"
              color={statusColor[status]}
              variant={status === 'paid' ? 'filled' : 'outlined'}
            />
            {status === 'paid' && invoice.paymentRecord && (
              <Chip
                icon={
                  invoice.paymentRecord.source === 'square-webhook' ? (
                    <CreditCardIcon />
                  ) : (
                    <PersonOutlineIcon />
                  )
                }
                label={
                  invoice.paymentRecord.source === 'square-webhook'
                    ? 'Paid via Square'
                    : 'Marked paid manually'
                }
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
            <Typography variant="body2" color="text.secondary">
              {invoice.lineItems.length} line
              {invoice.lineItems.length === 1 ? '' : 's'}
            </Typography>
          </Box>
        }
        secondary={
          <Typography variant="body2" color="text.secondary">
            {status === 'draft' && `Created ${formatDate(invoice.createdAt)}`}
            {status === 'sent' &&
              `Sent ${formatDate(invoice.issuedAt)}`}
            {status === 'paid' &&
              `Sent ${formatDate(invoice.issuedAt)} · Paid ${formatDate(invoice.paidAt)}`}
            {status === 'void' && `Voided (was ${formatDate(invoice.issuedAt)})`}
          </Typography>
        }
      />
    </ListItem>
  );
}

function LoadingSkeleton() {
  return (
    <Box>
      {[1, 2].map((i) => (
        <Skeleton key={i} variant="rectangular" height={56} sx={{ mb: 1 }} />
      ))}
    </Box>
  );
}

export function InvoiceList({
  invoicesState,
  onEdit,
  onSend,
  onMarkPaid,
  onVoid,
  onDelete,
}: InvoiceListProps) {
  if (invoicesState.status === 'loading') {
    return <LoadingSkeleton />;
  }
  if (invoicesState.status === 'error') {
    return (
      <Alert severity="error">
        Failed to load invoices: {invoicesState.error}
      </Alert>
    );
  }
  if (invoicesState.status === 'idle') {
    return null;
  }

  const invoices = invoicesState.data;

  if (invoices.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No invoices yet.
      </Typography>
    );
  }

  return (
    <List disablePadding>
      {invoices.map((invoice) => (
        <InvoiceRow
          key={invoice.id}
          invoice={invoice}
          onEdit={() => onEdit(invoice)}
          onSend={() => onSend(invoice)}
          onMarkPaid={() => onMarkPaid(invoice)}
          onVoid={() => onVoid(invoice)}
          onDelete={() => onDelete(invoice)}
        />
      ))}
    </List>
  );
}

// Re-export Collapse + Button so the student detail page can render a
// collapsible section header without additional MUI imports.
export { Collapse, Button };
