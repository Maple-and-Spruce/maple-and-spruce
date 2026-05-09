'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Skeleton,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import AddIcon from '@mui/icons-material/Add';
import { PeriodPicker, monthRangeFor } from '@maple/react/payouts';
import { useArtists } from '../../../../hooks';
import { useArtistPayouts } from '@maple/react/data';
import type { Payout, PayoutStatus } from '@maple/ts/domain';

function formatDollars(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function ArtistPayoutsPage(): React.ReactNode {
  // --- Filter state ---
  const [artistFilter, setArtistFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // --- Dialog state ---
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [markPaidDialogOpen, setMarkPaidDialogOpen] = useState(false);
  const [selectedPayoutId, setSelectedPayoutId] = useState<string | null>(null);

  // Generate dialog form state
  const [genArtistId, setGenArtistId] = useState<string>('');
  const [genRange, setGenRange] = useState(() => monthRangeFor(new Date(), -1));

  // Mark paid dialog form state
  const [paymentMethod, setPaymentMethod] = useState<string>('');
  const [paymentReference, setPaymentReference] = useState<string>('');

  // Feedback
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });

  const [generating, setGenerating] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);

  // --- Data ---
  const { artistsState } = useArtists();
  const artists =
    artistsState.status === 'success' ? artistsState.data : [];

  const effectiveArtistId =
    artistFilter === 'all' ? undefined : artistFilter;
  const effectiveStatus =
    statusFilter === 'all'
      ? undefined
      : (statusFilter as PayoutStatus);

  const { payoutsState, generatePayout, markAsPaid } = useArtistPayouts({
    artistId: effectiveArtistId,
    status: effectiveStatus,
  });

  // --- Artist name lookup ---
  const artistNameMap = useMemo(() => {
    const map = new Map<string, string>();
    artists.forEach((a) => map.set(a.id, a.name));
    return map;
  }, [artists]);

  // --- Generate payout handler ---
  const handleGenerate = useCallback(async () => {
    if (!genArtistId) return;
    setGenerating(true);
    try {
      await generatePayout(genArtistId, genRange.from, genRange.to);
      setGenerateDialogOpen(false);
      setGenArtistId('');
      setSnackbar({
        open: true,
        message: 'Payout generated successfully',
        severity: 'success',
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to generate payout';
      setSnackbar({ open: true, message, severity: 'error' });
    } finally {
      setGenerating(false);
    }
  }, [genArtistId, genRange, generatePayout]);

  // --- Mark as paid handler ---
  const handleMarkPaid = useCallback(async () => {
    if (!selectedPayoutId || !paymentMethod) return;
    setMarkingPaid(true);
    try {
      await markAsPaid(
        selectedPayoutId,
        paymentMethod,
        paymentReference || undefined
      );
      setMarkPaidDialogOpen(false);
      setSelectedPayoutId(null);
      setPaymentMethod('');
      setPaymentReference('');
      setSnackbar({
        open: true,
        message: 'Payout marked as paid',
        severity: 'success',
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to mark payout paid';
      setSnackbar({ open: true, message, severity: 'error' });
    } finally {
      setMarkingPaid(false);
    }
  }, [selectedPayoutId, paymentMethod, paymentReference, markAsPaid]);

  // --- DataGrid columns ---
  const columns: GridColDef<Payout>[] = useMemo(
    () => [
      {
        field: 'artistId',
        headerName: 'Artist',
        flex: 1,
        minWidth: 150,
        valueGetter: (_value: string, row: Payout) =>
          artistNameMap.get(row.artistId) ?? row.artistId,
      },
      {
        field: 'period',
        headerName: 'Period',
        flex: 1,
        minWidth: 200,
        valueGetter: (_value: unknown, row: Payout) =>
          `${formatDate(row.periodStart)} - ${formatDate(row.periodEnd)}`,
      },
      {
        field: 'saleCount',
        headerName: 'Sales',
        width: 80,
        type: 'number',
      },
      {
        field: 'totalSales',
        headerName: 'Total Sales',
        width: 120,
        type: 'number',
        valueFormatter: (value: number) => formatDollars(value),
      },
      {
        field: 'totalCommission',
        headerName: 'Commission',
        width: 120,
        type: 'number',
        valueFormatter: (value: number) => formatDollars(value),
      },
      {
        field: 'amountOwed',
        headerName: 'Amount Owed',
        width: 130,
        type: 'number',
        valueFormatter: (value: number) => formatDollars(value),
      },
      {
        field: 'status',
        headerName: 'Status',
        width: 110,
        renderCell: (params) => (
          <Chip
            label={params.value === 'paid' ? 'Paid' : 'Pending'}
            color={params.value === 'paid' ? 'success' : 'warning'}
            size="small"
            variant="outlined"
          />
        ),
      },
      {
        field: 'actions',
        headerName: 'Actions',
        width: 140,
        sortable: false,
        filterable: false,
        renderCell: (params) => {
          if (params.row.status !== 'pending') return null;
          return (
            <Button
              size="small"
              variant="outlined"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedPayoutId(params.row.id);
                setMarkPaidDialogOpen(true);
              }}
            >
              Mark Paid
            </Button>
          );
        },
      },
    ],
    [artistNameMap]
  );

  // --- Render ---
  const payouts =
    payoutsState.status === 'success' ? payoutsState.data : [];

  return (
    <>
      <Box sx={{ mb: 3 }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <div>
            <Typography variant="h4" component="h1" gutterBottom>
              Artist Payouts
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Generate and track payouts for consignment artist sales. Each
              payout aggregates unpaid sales for a given period.
            </Typography>
          </div>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setGenerateDialogOpen(true)}
          >
            Generate Payout
          </Button>
        </Stack>
      </Box>

      {/* Filters */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3 }}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel id="artist-filter-label">Artist</InputLabel>
          <Select
            labelId="artist-filter-label"
            label="Artist"
            value={artistFilter}
            onChange={(e) => setArtistFilter(e.target.value)}
          >
            <MenuItem value="all">All artists</MenuItem>
            {artists.map((a) => (
              <MenuItem key={a.id} value={a.id}>
                {a.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="status-filter-label">Status</InputLabel>
          <Select
            labelId="status-filter-label"
            label="Status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <MenuItem value="all">All statuses</MenuItem>
            <MenuItem value="pending">Pending</MenuItem>
            <MenuItem value="paid">Paid</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      {/* Data Grid */}
      {payoutsState.status === 'loading' && (
        <Stack spacing={1}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={52} />
          ))}
        </Stack>
      )}
      {payoutsState.status === 'error' && (
        <Alert severity="error">
          Failed to load payouts: {payoutsState.error}
        </Alert>
      )}
      {payoutsState.status === 'success' && (
        <DataGrid
          rows={payouts}
          columns={columns}
          autoHeight
          pageSizeOptions={[10, 25, 50]}
          initialState={{
            pagination: { paginationModel: { pageSize: 10 } },
          }}
          disableRowSelectionOnClick
          sx={{
            '& .MuiDataGrid-cell': { py: 1 },
          }}
        />
      )}

      {/* Generate Payout Dialog */}
      <Dialog
        open={generateDialogOpen}
        onClose={() => setGenerateDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Generate Artist Payout</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel id="gen-artist-label">Artist</InputLabel>
              <Select
                labelId="gen-artist-label"
                label="Artist"
                value={genArtistId}
                onChange={(e) => setGenArtistId(e.target.value)}
              >
                {artists.map((a) => (
                  <MenuItem key={a.id} value={a.id}>
                    {a.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <PeriodPicker
              from={genRange.from}
              to={genRange.to}
              onChange={setGenRange}
            />
            <Typography variant="body2" color="text.secondary">
              This will aggregate all unpaid sales for the selected artist
              within the specified period and create a payout record.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGenerateDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleGenerate}
            disabled={!genArtistId || generating}
          >
            {generating ? 'Generating...' : 'Generate'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Mark as Paid Dialog */}
      <Dialog
        open={markPaidDialogOpen}
        onClose={() => setMarkPaidDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Mark Payout as Paid</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel id="payment-method-label">
                Payment Method
              </InputLabel>
              <Select
                labelId="payment-method-label"
                label="Payment Method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <MenuItem value="check">Check</MenuItem>
                <MenuItem value="venmo">Venmo</MenuItem>
                <MenuItem value="cash">Cash</MenuItem>
                <MenuItem value="zelle">Zelle</MenuItem>
                <MenuItem value="other">Other</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Reference / Note (optional)"
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              placeholder="e.g., Check #1234"
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMarkPaidDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleMarkPaid}
            disabled={!paymentMethod || markingPaid}
          >
            {markingPaid ? 'Saving...' : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar feedback */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}
