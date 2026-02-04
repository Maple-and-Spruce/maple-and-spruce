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
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import type { Discount, RequestState } from '@maple/ts/domain';
import { formatDiscount } from '@maple/ts/domain';

interface DiscountListProps {
  discountsState: RequestState<Discount[]>;
  onEdit: (discount: Discount) => void;
  onDelete: (discount: Discount) => void;
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function DiscountList({
  discountsState,
  onEdit,
  onDelete,
}: DiscountListProps) {
  if (discountsState.status === 'loading' || discountsState.status === 'idle') {
    return (
      <Box sx={{ mt: 2 }}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} height={60} sx={{ mb: 1 }} />
        ))}
      </Box>
    );
  }

  if (discountsState.status === 'error') {
    return (
      <Alert severity="error" sx={{ mt: 2 }}>
        Failed to load discounts: {discountsState.error}
      </Alert>
    );
  }

  const discounts = discountsState.data;

  if (discounts.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
        <Typography variant="h6">No discount codes yet</Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>
          Create a discount code to offer savings on class registrations.
        </Typography>
      </Box>
    );
  }

  return (
    <TableContainer component={Paper} sx={{ mt: 2 }}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Code</TableCell>
            <TableCell>Description</TableCell>
            <TableCell>Type</TableCell>
            <TableCell>Value</TableCell>
            <TableCell>Status</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {discounts.map((discount) => (
            <TableRow key={discount.id} hover>
              <TableCell>
                <Typography
                  variant="body2"
                  sx={{ fontFamily: 'monospace', fontWeight: 600 }}
                >
                  {discount.code}
                </Typography>
              </TableCell>
              <TableCell>{discount.description}</TableCell>
              <TableCell>
                <Chip
                  label={
                    discount.type === 'percent'
                      ? 'Percent'
                      : discount.type === 'amount'
                        ? 'Fixed Amount'
                        : 'Early Bird'
                  }
                  size="small"
                  variant="outlined"
                />
              </TableCell>
              <TableCell>
                {formatDiscount(discount)}
                {discount.type === 'amount-before-date' &&
                  discount.cutoffDate && (
                    <Typography
                      variant="caption"
                      display="block"
                      color="text.secondary"
                    >
                      Before {formatDate(discount.cutoffDate)}
                    </Typography>
                  )}
              </TableCell>
              <TableCell>
                <Chip
                  label={discount.status}
                  size="small"
                  color={
                    discount.status === 'active' ? 'success' : 'default'
                  }
                />
              </TableCell>
              <TableCell align="right">
                <IconButton size="small" onClick={() => onEdit(discount)}>
                  <EditIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" onClick={() => onDelete(discount)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
