'use client';

/**
 * Needs Attention (#807).
 *
 * Six states that were already true in the data and that nobody could see
 * without going looking, per student. Each row is money or compliance quietly
 * going wrong.
 *
 * Two rules shape this component:
 *
 * 1. **Quiet when there is nothing to do.** It renders nothing at all rather
 *    than an empty card. A panel that is usually empty trains people to stop
 *    reading it, and then it is worse than not existing.
 * 2. **Every row can be acted on from here.** Either the panel fixes it inline
 *    (one field, one click) or the row links to the exact record — never to a
 *    list to search. A row that can only be described does not belong here.
 *
 * Groups are ordered by the cost of ignoring them, not by count, so the one
 * invoice that never reached Square sits above nine students with a flag off.
 */

import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  IconButton,
  Link as MuiLink,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import type {
  NeedsAttentionGroup,
  NeedsAttentionKind,
  NeedsAttentionRow,
} from '@maple/ts/domain';

export interface NeedsAttentionPanelProps {
  groups: NeedsAttentionGroup[];
  total: number;
  /** True when a lesson teacher is seeing only their own students. */
  scopedToSelf?: boolean;
  /** Ids currently being resolved inline. */
  resolving?: Set<string>;
  /** Fix an `inline` row. Currently only "turn on automatic invoicing". */
  onResolve?: (row: NeedsAttentionRow) => void;
}

/** Only the top group is open by default — the rest are one click away. */
function isInitiallyOpen(index: number): boolean {
  return index === 0;
}

const SEVERITY: Partial<Record<NeedsAttentionKind, 'error' | 'warning'>> = {
  'invoice-sync-failed': 'error',
  'lesson-unbilled': 'error',
  'hope-unsubmitted': 'warning',
  'invoice-overdue': 'warning',
};

function RowAction({
  row,
  resolving,
  onResolve,
}: {
  row: NeedsAttentionRow;
  resolving: boolean;
  onResolve?: (row: NeedsAttentionRow) => void;
}) {
  if (row.resolution === 'inline') {
    return (
      <Button
        size="small"
        variant="outlined"
        disabled={resolving || !onResolve}
        startIcon={
          resolving ? <CircularProgress size={14} color="inherit" /> : null
        }
        onClick={() => onResolve?.(row)}
      >
        {resolving ? 'Saving…' : 'Turn on'}
      </Button>
    );
  }

  return (
    <MuiLink
      href={row.href}
      underline="hover"
      sx={{ display: 'inline-flex', alignItems: 'center', fontSize: 14 }}
    >
      Open
      <ChevronRightIcon fontSize="small" />
    </MuiLink>
  );
}

function Group({
  group,
  defaultOpen,
  resolving,
  onResolve,
}: {
  group: NeedsAttentionGroup;
  defaultOpen: boolean;
  resolving: Set<string>;
  onResolve?: (row: NeedsAttentionRow) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const severity = SEVERITY[group.kind];

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          py: 1,
          cursor: 'pointer',
        }}
        onClick={() => setOpen((v) => !v)}
      >
        <Chip
          size="small"
          label={group.rows.length}
          color={severity ?? 'default'}
          sx={{ minWidth: 36, fontVariantNumeric: 'tabular-nums' }}
        />
        <Typography variant="body1" sx={{ flex: 1 }}>
          {group.title}
        </Typography>
        <IconButton
          size="small"
          aria-label={`${open ? 'Hide' : 'Show'} ${group.title}`}
          aria-expanded={open}
        >
          {open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>

      <Collapse in={open}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mb: 1 }}
        >
          {group.because}
        </Typography>
        <Stack divider={<Divider flexItem />}>
          {group.rows.map((row) => (
            <Box
              key={`${row.kind}-${row.id}`}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 2,
                py: 1,
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2">{row.label}</Typography>
                {row.detail && (
                  <Typography variant="caption" color="text.secondary">
                    {row.detail}
                  </Typography>
                )}
              </Box>
              <RowAction
                row={row}
                resolving={resolving.has(row.id)}
                onResolve={onResolve}
              />
            </Box>
          ))}
        </Stack>
      </Collapse>
    </Box>
  );
}

export function NeedsAttentionPanel({
  groups,
  total,
  scopedToSelf = false,
  resolving = new Set(),
  onResolve,
}: NeedsAttentionPanelProps) {
  // Renders nothing at all when there is nothing to do. See the header comment:
  // a panel that is usually empty is worse than no panel.
  if (total === 0 || groups.length === 0) return null;

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
      <Stack
        direction="row"
        alignItems="baseline"
        spacing={1}
        sx={{ mb: 1, flexWrap: 'wrap' }}
      >
        <Typography variant="h6">Needs attention</Typography>
        <Typography variant="body2" color="text.secondary">
          {total} thing{total === 1 ? '' : 's'}
        </Typography>
      </Stack>

      {scopedToSelf && (
        <Alert severity="info" sx={{ mb: 1, py: 0 }}>
          Showing only your own students.
        </Alert>
      )}

      <Stack divider={<Divider flexItem />}>
        {groups.map((group, i) => (
          <Group
            key={group.kind}
            group={group}
            defaultOpen={isInitiallyOpen(i)}
            resolving={resolving}
            onResolve={onResolve}
          />
        ))}
      </Stack>
    </Paper>
  );
}
