'use client';

import { useMemo } from 'react';
import {
  Box,
  Chip,
  IconButton,
  Typography,
  Alert,
  Paper,
  Tooltip,
} from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import SyncProblemIcon from '@mui/icons-material/SyncProblem';
import type {
  SyncConflict,
  SyncConflictType,
  SyncConflictStatus,
  RequestState,
} from '@maple/ts/domain';
import { formatPrice } from '@maple/ts/domain';
import { surfaces, borders, radii, shadows } from '@maple/react/theme';

interface SyncConflictDataTableProps {
  conflictsState: RequestState<SyncConflict[]>;
  onResolve: (conflict: SyncConflict) => void;
  /** Optional filtered conflicts - if provided, uses these instead of conflictsState */
  filteredConflicts?: SyncConflict[];
}

const typeLabels: Record<SyncConflictType, string> = {
  quantity_mismatch: 'Quantity Mismatch',
  price_mismatch: 'Price Mismatch',
  missing_local: 'Missing Locally',
  missing_external: 'Missing in Square',
  unexpected_sale: 'Unexpected Sale',
};

const typeColors: Record<SyncConflictType, 'error' | 'warning' | 'info'> = {
  quantity_mismatch: 'warning',
  price_mismatch: 'warning',
  missing_local: 'info',
  missing_external: 'error',
  unexpected_sale: 'error',
};

const statusColors: Record<SyncConflictStatus, 'warning' | 'success' | 'default'> = {
  pending: 'warning',
  resolved: 'success',
  ignored: 'default',
};

const statusIcons: Record<SyncConflictStatus, React.ReactNode> = {
  pending: <WarningIcon fontSize="small" />,
  resolved: <CheckCircleIcon fontSize="small" />,
  ignored: <ErrorIcon fontSize="small" />,
};

/**
 * Convert Firestore Timestamp or Date to a formatted string
 * Firestore returns timestamps as objects with toDate() or seconds/nanoseconds
 */
function formatDate(date: Date | { toDate?: () => Date; seconds?: number }): string {
  let jsDate: Date;

  if (date instanceof Date) {
    jsDate = date;
  } else if (typeof date === 'object' && date !== null) {
    if ('toDate' in date && typeof date.toDate === 'function') {
      jsDate = date.toDate();
    } else if ('seconds' in date && typeof date.seconds === 'number') {
      jsDate = new Date(date.seconds * 1000);
    } else {
      return '—';
    }
  } else {
    return '—';
  }

  if (isNaN(jsDate.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(jsDate);
}

export function SyncConflictDataTable({
  conflictsState,
  onResolve,
  filteredConflicts,
}: SyncConflictDataTableProps) {
  const columns: GridColDef[] = useMemo(
    () => [
      {
        field: 'type',
        headerName: 'Type',
        width: 160,
        renderCell: (params: GridRenderCellParams<SyncConflict>) => (
          <Chip
            label={typeLabels[params.row.type]}
            size="small"
            color={typeColors[params.row.type]}
            variant="outlined"
          />
        ),
      },
      {
        field: 'product',
        headerName: 'Product',
        flex: 1,
        minWidth: 180,
        valueGetter: (_value, row: SyncConflict) =>
          row.localState.name || row.externalState.name || row.productId,
      },
      {
        field: 'localState',
        headerName: 'Local State',
        width: 150,
        renderCell: (params: GridRenderCellParams<SyncConflict>) => {
          const state = params.row.localState;
          const type = params.row.type;

          if (type === 'missing_local') {
            return (
              <Typography variant="body2" color="text.secondary" fontStyle="italic">
                Not tracked
              </Typography>
            );
          }

          return (
            <Box>
              <Typography variant="body2">
                Qty: {state.quantity}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatPrice(state.price)}
              </Typography>
            </Box>
          );
        },
      },
      {
        field: 'externalState',
        headerName: 'Square State',
        width: 150,
        renderCell: (params: GridRenderCellParams<SyncConflict>) => {
          const state = params.row.externalState;
          const type = params.row.type;

          if (type === 'missing_external') {
            return (
              <Typography variant="body2" color="text.secondary" fontStyle="italic">
                Deleted
              </Typography>
            );
          }

          return (
            <Box>
              <Typography variant="body2">
                Qty: {state.quantity}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatPrice(state.price)}
              </Typography>
            </Box>
          );
        },
      },
      {
        field: 'difference',
        headerName: 'Difference',
        width: 130,
        renderCell: (params: GridRenderCellParams<SyncConflict>) => {
          const { localState, externalState, type } = params.row;

          if (type === 'quantity_mismatch') {
            const diff = localState.quantity - externalState.quantity;
            return (
              <Chip
                label={`${diff > 0 ? '+' : ''}${diff} qty`}
                size="small"
                color={diff > 0 ? 'success' : 'error'}
                variant="outlined"
              />
            );
          }

          if (type === 'price_mismatch') {
            const diff = localState.price - externalState.price;
            return (
              <Chip
                label={`${diff > 0 ? '+' : ''}${formatPrice(diff)}`}
                size="small"
                color={diff > 0 ? 'success' : 'error'}
                variant="outlined"
              />
            );
          }

          return (
            <Typography variant="body2" color="text.secondary">
              —
            </Typography>
          );
        },
      },
      {
        field: 'detectedAt',
        headerName: 'Detected',
        width: 130,
        valueGetter: (_value, row: SyncConflict) => row.detectedAt,
        renderCell: (params: GridRenderCellParams<SyncConflict>) => (
          <Typography variant="body2">
            {formatDate(params.row.detectedAt)}
          </Typography>
        ),
      },
      {
        field: 'status',
        headerName: 'Status',
        width: 120,
        renderCell: (params: GridRenderCellParams<SyncConflict>) => (
          <Chip
            icon={statusIcons[params.row.status] as React.ReactElement}
            label={params.row.status}
            size="small"
            color={statusColors[params.row.status]}
            variant={params.row.status === 'pending' ? 'filled' : 'outlined'}
          />
        ),
      },
      {
        field: 'resolution',
        headerName: 'Resolution',
        width: 130,
        renderCell: (params: GridRenderCellParams<SyncConflict>) => {
          if (!params.row.resolution) {
            return (
              <Typography variant="body2" color="text.secondary">
                —
              </Typography>
            );
          }

          const resolutionLabels: Record<string, string> = {
            use_local: 'Used Local',
            use_external: 'Used Square',
            manual: 'Manual',
            ignored: 'Ignored',
          };

          return (
            <Tooltip title={params.row.notes || ''}>
              <Typography variant="body2">
                {resolutionLabels[params.row.resolution] || params.row.resolution}
              </Typography>
            </Tooltip>
          );
        },
      },
      {
        field: 'actions',
        headerName: 'Actions',
        width: 100,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        renderCell: (params: GridRenderCellParams<SyncConflict>) => {
          if (params.row.status !== 'pending') {
            return (
              <Typography variant="body2" color="text.secondary">
                —
              </Typography>
            );
          }

          return (
            <Tooltip title="Resolve conflict">
              <IconButton
                onClick={() => onResolve(params.row)}
                size="small"
                color="primary"
                aria-label="Resolve"
              >
                <SyncProblemIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          );
        },
      },
    ],
    [onResolve]
  );

  if (conflictsState.status === 'error') {
    return (
      <Alert severity="error">
        Failed to load sync conflicts: {conflictsState.error}
      </Alert>
    );
  }

  if (conflictsState.status === 'idle') {
    return null;
  }

  // Use filtered conflicts if provided, otherwise use all conflicts from state
  const conflicts =
    filteredConflicts ??
    (conflictsState.status === 'success' ? conflictsState.data : []);

  if (conflictsState.status === 'success' && conflictsState.data.length === 0) {
    return (
      <Box
        sx={{
          textAlign: 'center',
          py: 8,
          color: 'text.secondary',
        }}
      >
        <CheckCircleIcon sx={{ fontSize: 48, mb: 2, color: 'success.main' }} />
        <Typography variant="h6">No sync conflicts</Typography>
        <Typography>All inventory is in sync with Square</Typography>
      </Box>
    );
  }

  return (
    <Paper
      elevation={0}
      sx={{
        width: '100%',
        backgroundColor: surfaces.paper,
        borderRadius: `${radii.lg}px`,
        border: `1px solid ${borders.default}`,
        boxShadow: shadows.sm,
        overflow: 'hidden',
      }}
    >
      <DataGrid
        rows={conflicts}
        columns={columns}
        loading={conflictsState.status === 'loading'}
        pageSizeOptions={[10, 25, 50]}
        initialState={{
          pagination: { paginationModel: { pageSize: 25 } },
          sorting: { sortModel: [{ field: 'detectedAt', sort: 'desc' }] },
        }}
        disableRowSelectionOnClick
        autoHeight
        sx={{
          border: 'none',
          backgroundColor: surfaces.paper,
          '--DataGrid-containerBackground': surfaces.tableHeader,
          '& .MuiDataGrid-columnHeaders': {
            backgroundColor: surfaces.tableHeader,
            borderBottom: `1px solid ${borders.subtle}`,
          },
          '& .MuiDataGrid-columnHeaderTitle': {
            fontWeight: 600,
          },
          '& .MuiDataGrid-cell': {
            display: 'flex',
            alignItems: 'center',
            borderColor: borders.subtle,
          },
          '& .MuiDataGrid-row:last-child .MuiDataGrid-cell': {
            borderBottom: 'none',
          },
          '& .MuiDataGrid-footerContainer': {
            borderTop: `1px solid ${borders.subtle}`,
          },
        }}
      />
    </Paper>
  );
}
