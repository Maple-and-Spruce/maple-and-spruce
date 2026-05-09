'use client';

import { useMemo } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Chip,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import PeopleIcon from '@mui/icons-material/People';
import EventIcon from '@mui/icons-material/Event';
import {
  DataGrid,
  type GridColDef,
  type GridRenderCellParams,
} from '@mui/x-data-grid';
import type {
  Class,
  ClassCategory,
  Instructor,
  RequestState,
} from '@maple/ts/domain';
import {
  asPublishable,
  formatClassPrice,
  formatSessions,
  getFirstSession,
} from '@maple/ts/domain';
import { surfaces, borders, radii, shadows } from '@maple/react/theme';

interface ClassTableProps {
  classesState: RequestState<Class[]>;
  instructors?: Instructor[];
  categories?: ClassCategory[];
  /** Map of classId → number of active (pending+confirmed) registrations. */
  registrationCounts?: Map<string, number>;
  onEdit: (classItem: Class) => void;
  onDelete: (classItem: Class) => void;
  onDuplicate?: (classItem: Class) => void;
  onViewRoster?: (classItem: Class) => void;
  duplicatingClassId?: string;
}

const statusColors: Record<
  string,
  'success' | 'default' | 'error' | 'warning'
> = {
  published: 'success',
  draft: 'default',
  cancelled: 'error',
  completed: 'warning',
};

interface ClassRow {
  id: string;
  classItem: Class;
  name: string;
  imageUrl?: string;
  scheduleSortKey: number;
  scheduleDisplay: string;
  instructorName: string;
  categoryName: string;
  filled: number;
  capacity: number;
  priceCents: number;
  status: Class['status'];
}

function buildScheduleDisplay(classItem: Class): {
  sortKey: number;
  display: string;
} {
  const publishable = asPublishable(classItem);
  if (!publishable) {
    return { sortKey: Number.POSITIVE_INFINITY, display: 'No dates set' };
  }
  const first = getFirstSession(publishable).dateTime;
  const sortKey = (first instanceof Date ? first : new Date(first)).getTime();
  const { dateDisplay, timeDisplay } = formatSessions(classItem.sessions);
  const timeSuffix =
    timeDisplay && timeDisplay !== 'Varies' ? ` · ${timeDisplay}` : '';
  return { sortKey, display: `${dateDisplay}${timeSuffix}` };
}

export function ClassTable({
  classesState,
  instructors = [],
  categories = [],
  registrationCounts,
  onEdit,
  onDelete,
  onDuplicate,
  onViewRoster,
  duplicatingClassId,
}: ClassTableProps) {
  const instructorMap = useMemo(
    () => new Map(instructors.map((i) => [i.id, i.name])),
    [instructors]
  );
  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories]
  );

  const rows = useMemo<ClassRow[]>(() => {
    if (classesState.status !== 'success') return [];
    return classesState.data.map((classItem) => {
      const { sortKey, display } = buildScheduleDisplay(classItem);
      return {
        id: classItem.id,
        classItem,
        name: classItem.name,
        imageUrl: classItem.imageUrl,
        scheduleSortKey: sortKey,
        scheduleDisplay: display,
        instructorName: classItem.instructorId
          ? instructorMap.get(classItem.instructorId) ?? '—'
          : '—',
        categoryName: classItem.categoryId
          ? categoryMap.get(classItem.categoryId) ?? '—'
          : '—',
        filled: registrationCounts?.get(classItem.id) ?? 0,
        capacity: classItem.capacity,
        priceCents: classItem.priceCents,
        status: classItem.status,
      };
    });
  }, [classesState, instructorMap, categoryMap, registrationCounts]);

  const columns: GridColDef<ClassRow>[] = useMemo(
    () => [
      {
        field: 'name',
        headerName: 'Class',
        flex: 1,
        minWidth: 220,
        renderCell: (params: GridRenderCellParams<ClassRow>) => (
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Avatar
              variant="rounded"
              src={params.row.imageUrl}
              alt=""
              sx={{
                width: 40,
                height: 40,
                bgcolor: 'grey.100',
                color: 'grey.500',
              }}
            >
              <EventIcon fontSize="small" />
            </Avatar>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {params.row.name}
            </Typography>
          </Stack>
        ),
      },
      {
        field: 'scheduleSortKey',
        headerName: 'Schedule',
        flex: 1,
        minWidth: 200,
        sortComparator: (a: number, b: number) => a - b,
        valueGetter: (_value, row) => row.scheduleSortKey,
        renderCell: (params: GridRenderCellParams<ClassRow>) => (
          <Typography variant="body2" color="text.secondary">
            {params.row.scheduleDisplay}
          </Typography>
        ),
      },
      {
        field: 'instructorName',
        headerName: 'Instructor',
        width: 150,
      },
      {
        field: 'filled',
        headerName: 'Filled',
        width: 100,
        type: 'number',
        valueGetter: (_value, row) => row.filled,
        renderCell: (params: GridRenderCellParams<ClassRow>) => {
          const { filled, capacity } = params.row;
          const isFull = capacity > 0 && filled >= capacity;
          return (
            <Typography
              variant="body2"
              color={isFull ? 'error.main' : 'text.primary'}
              sx={{ fontWeight: isFull ? 600 : 400 }}
            >
              {filled}/{capacity}
            </Typography>
          );
        },
      },
      {
        field: 'priceCents',
        headerName: 'Price',
        width: 90,
        type: 'number',
        valueFormatter: (value: number) => formatClassPrice(value ?? 0),
      },
      {
        field: 'status',
        headerName: 'Status',
        width: 120,
        renderCell: (params: GridRenderCellParams<ClassRow>) => (
          <Chip
            label={params.row.status}
            size="small"
            color={statusColors[params.row.status]}
          />
        ),
      },
      {
        field: 'category',
        headerName: 'Category',
        width: 140,
        valueGetter: (_value, row) => row.categoryName,
      },
      {
        field: 'actions',
        headerName: 'Actions',
        width: 170,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        align: 'right',
        headerAlign: 'right',
        renderCell: (params: GridRenderCellParams<ClassRow>) => {
          const classItem = params.row.classItem;
          return (
            <Stack direction="row" spacing={0.5}>
              {onViewRoster && (
                <Tooltip title="View roster">
                  <IconButton
                    onClick={() => onViewRoster(classItem)}
                    size="small"
                    aria-label="View Roster"
                    color="primary"
                  >
                    <PeopleIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title="Edit">
                <IconButton
                  onClick={() => onEdit(classItem)}
                  size="small"
                  aria-label="Edit"
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              {onDuplicate && (
                <Tooltip title="Copy class">
                  <span>
                    <IconButton
                      onClick={() => onDuplicate(classItem)}
                      size="small"
                      aria-label="Copy class"
                      disabled={duplicatingClassId === classItem.id}
                    >
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              )}
              <Tooltip title="Delete">
                <IconButton
                  onClick={() => onDelete(classItem)}
                  size="small"
                  aria-label="Delete"
                  color="error"
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          );
        },
      },
    ],
    [onEdit, onDelete, onDuplicate, onViewRoster, duplicatingClassId]
  );

  if (classesState.status === 'error') {
    return (
      <Alert severity="error">
        Failed to load classes: {classesState.error}
      </Alert>
    );
  }

  if (classesState.status === 'idle') {
    return null;
  }

  if (classesState.status === 'success' && rows.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
        <Typography variant="h6">No classes match your filters</Typography>
        <Typography>
          Try clearing filters or click &quot;Add Class&quot; to create one.
        </Typography>
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
        rows={rows}
        columns={columns}
        loading={classesState.status === 'loading'}
        pageSizeOptions={[10, 25, 50, 100]}
        initialState={{
          pagination: { paginationModel: { pageSize: 25 } },
          sorting: { sortModel: [{ field: 'scheduleSortKey', sort: 'asc' }] },
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
