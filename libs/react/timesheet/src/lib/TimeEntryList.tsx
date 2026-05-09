'use client';

import { useMemo, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Checkbox,
  Chip,
  IconButton,
  Stack,
  Typography,
  Button,
  Paper,
  Box,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import type { TimeEntry } from '@maple/ts/domain';
import { formatHours } from './format';

export interface TimeEntryListProps {
  entries: TimeEntry[];
  /** When true, show the multi-select column and Mark Paid button. */
  adminMode?: boolean;
  /** Caller's UID — used to decide which delete buttons to render in non-admin mode. */
  callerUid?: string;
  onDelete?: (id: string) => Promise<void> | void;
  onMarkPaid?: (ids: string[]) => Promise<void> | void;
  isMarkingPaid?: boolean;
}

export function TimeEntryList({
  entries,
  adminMode = false,
  callerUid,
  onDelete,
  onMarkPaid,
  isMarkingPaid = false,
}: TimeEntryListProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const unpaidEntries = useMemo(
    () => entries.filter((e) => e.status === 'unpaid'),
    [entries]
  );

  const allUnpaidSelected =
    unpaidEntries.length > 0 &&
    unpaidEntries.every((e) => selectedIds.has(e.id));

  const toggleAll = () => {
    if (allUnpaidSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(unpaidEntries.map((e) => e.id)));
    }
  };

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleMarkPaid = async () => {
    if (!onMarkPaid || selectedIds.size === 0) return;
    await onMarkPaid(Array.from(selectedIds));
    setSelectedIds(new Set());
  };

  if (entries.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">No time entries yet.</Typography>
      </Paper>
    );
  }

  return (
    <Paper variant="outlined">
      {adminMode && (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            px: 2,
            py: 1.5,
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {selectedIds.size} selected
          </Typography>
          <Button
            variant="contained"
            color="primary"
            disabled={selectedIds.size === 0 || isMarkingPaid}
            onClick={handleMarkPaid}
          >
            {isMarkingPaid ? 'Marking paid...' : 'Mark paid'}
          </Button>
        </Box>
      )}
      <Table size="small">
        <TableHead>
          <TableRow>
            {adminMode && (
              <TableCell padding="checkbox">
                <Checkbox
                  indeterminate={
                    selectedIds.size > 0 && !allUnpaidSelected
                  }
                  checked={allUnpaidSelected}
                  onChange={toggleAll}
                  disabled={unpaidEntries.length === 0}
                />
              </TableCell>
            )}
            <TableCell>Date</TableCell>
            <TableCell align="right">Hours</TableCell>
            <TableCell>Notes</TableCell>
            <TableCell>Status</TableCell>
            <TableCell align="right" />
          </TableRow>
        </TableHead>
        <TableBody>
          {entries.map((entry) => {
            const isUnpaid = entry.status === 'unpaid';
            const canDelete =
              isUnpaid && (adminMode || entry.employeeId === callerUid);
            return (
              <TableRow key={entry.id} hover>
                {adminMode && (
                  <TableCell padding="checkbox">
                    <Checkbox
                      disabled={!isUnpaid}
                      checked={selectedIds.has(entry.id)}
                      onChange={() => toggle(entry.id)}
                    />
                  </TableCell>
                )}
                <TableCell>{entry.date}</TableCell>
                <TableCell align="right">{formatHours(entry.hours)}</TableCell>
                <TableCell sx={{ maxWidth: 320 }}>
                  <Stack spacing={0}>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                      {entry.notes || ''}
                    </Typography>
                  </Stack>
                </TableCell>
                <TableCell>
                  {isUnpaid ? (
                    <Chip size="small" label="Unpaid" color="warning" />
                  ) : (
                    <Chip
                      size="small"
                      label={
                        entry.paidAt
                          ? `Paid ${new Date(entry.paidAt).toLocaleDateString()}`
                          : 'Paid'
                      }
                      color="success"
                      variant="outlined"
                    />
                  )}
                </TableCell>
                <TableCell align="right">
                  {canDelete && onDelete && (
                    <IconButton
                      size="small"
                      aria-label="Delete entry"
                      onClick={() => onDelete(entry.id)}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Paper>
  );
}
