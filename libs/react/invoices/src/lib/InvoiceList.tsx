'use client';

import { useState, type ReactElement } from 'react';
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
  Menu,
  MenuItem,
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
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import type {
  Invoice,
  InvoicePaymentSource,
  InvoiceStatus,
  ManualInvoicePaymentSource,
  RequestState,
} from '@maple/ts/domain';
import { formatCents } from '@maple/react/lessons';

interface InvoiceListProps {
  invoicesState: RequestState<Invoice[]>;
  onEdit: (invoice: Invoice) => void;
  onSend: (invoice: Invoice) => void;
  /** Record a payment against a sent invoice, attributed to a manual source
   *  (Venmo witnessed at a lesson, or cash/check/other). */
  onRecordPayment: (
    invoice: Invoice,
    source: ManualInvoicePaymentSource
  ) => void;
  onVoid: (invoice: Invoice) => void;
  onDelete: (invoice: Invoice) => void;
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
    case 'admin-manual':
    default:
      return { icon: <PersonOutlineIcon />, label: 'Marked paid manually' };
  }
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
            <>
              <IconButton
                onClick={(e) => setPayMenuAnchor(e.currentTarget)}
                size="small"
                aria-label="Mark invoice paid"
                aria-haspopup="menu"
                color="success"
              >
                <MonetizationOnIcon fontSize="small" />
              </IconButton>
              <Menu
                anchorEl={payMenuAnchor}
                open={!!payMenuAnchor}
                onClose={closePayMenu}
              >
                <MenuItem onClick={() => recordAndClose('venmo-manual')}>
                  <AccountBalanceWalletIcon
                    fontSize="small"
                    sx={{ mr: 1 }}
                  />
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
            {status === 'paid' &&
              invoice.paymentRecord &&
              (() => {
                const { icon, label } = paymentAttribution(
                  invoice.paymentRecord.source
                );
                return (
                  <Chip
                    icon={icon}
                    label={label}
                    title={invoice.paymentRecord.note ?? undefined}
                    size="small"
                    variant="outlined"
                  />
                );
              })()}
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
  onRecordPayment,
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
          onRecordPayment={(source) => onRecordPayment(invoice, source)}
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
