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
  Tooltip,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import type { AgreementRequest, RequestState } from '@maple/ts/domain';

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const statusColors: Record<
  string,
  'warning' | 'success' | 'error' | 'default'
> = {
  pending: 'warning',
  signed: 'success',
  expired: 'error',
  cancelled: 'default',
};

interface AgreementRequestListProps {
  requestsState: RequestState<AgreementRequest[]>;
  onResend: (id: string) => void;
  isResending?: boolean;
}

export function AgreementRequestList({
  requestsState,
  onResend,
  isResending,
}: AgreementRequestListProps) {
  if (
    requestsState.status === 'loading' ||
    requestsState.status === 'idle'
  ) {
    return (
      <Box sx={{ mt: 2 }}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} height={60} sx={{ mb: 1 }} />
        ))}
      </Box>
    );
  }

  if (requestsState.status === 'error') {
    return (
      <Alert severity="error" sx={{ mt: 2 }}>
        Failed to load requests: {requestsState.error}
      </Alert>
    );
  }

  const requests = requestsState.data;

  if (requests.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
        <Typography variant="h6">No agreement requests yet</Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>
          Requests are created when you send a waiver or when a customer
          registers for a class with an auto-attach template.
        </Typography>
      </Box>
    );
  }

  return (
    <TableContainer component={Paper} sx={{ mt: 2 }}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Signer</TableCell>
            <TableCell>Method</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Created</TableCell>
            <TableCell>Expires</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {requests.map((request) => (
            <TableRow key={request.id} hover>
              <TableCell>
                <Typography variant="body2" fontWeight={600}>
                  {request.signerName}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {request.signerEmail}
                </Typography>
              </TableCell>
              <TableCell>
                <Chip
                  label={request.deliveryMethod}
                  size="small"
                  variant="outlined"
                />
              </TableCell>
              <TableCell>
                <Chip
                  label={request.status}
                  size="small"
                  color={statusColors[request.status] ?? 'default'}
                />
              </TableCell>
              <TableCell>{formatDate(request.createdAt)}</TableCell>
              <TableCell>{formatDate(request.expiresAt)}</TableCell>
              <TableCell align="right">
                {request.status === 'pending' && (
                  <Tooltip title="Resend signing email">
                    <IconButton
                      size="small"
                      onClick={() => onResend(request.id)}
                      disabled={isResending}
                    >
                      <RefreshIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
