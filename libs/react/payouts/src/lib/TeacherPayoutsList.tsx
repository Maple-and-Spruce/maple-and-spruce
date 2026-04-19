'use client';

import { useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Chip,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import StarsIcon from '@mui/icons-material/Stars';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import type { RequestState, TeacherPayout } from '@maple/ts/domain';
import { formatCents } from '@maple/react/lessons';

interface TeacherPayoutsListProps {
  payoutsState: RequestState<TeacherPayout[]>;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function LoadingSkeleton() {
  return (
    <Stack spacing={1}>
      {[1, 2].map((i) => (
        <Skeleton key={i} variant="rectangular" height={72} />
      ))}
    </Stack>
  );
}

function SourceChip({ source }: { source: TeacherPayout['lines'][number]['source'] }) {
  return source === 'hope-rendered' ? (
    <Chip
      size="small"
      icon={<StarsIcon />}
      label="Hope"
      variant="outlined"
      color="info"
    />
  ) : (
    <Chip
      size="small"
      icon={<CreditCardIcon />}
      label="Private"
      variant="outlined"
    />
  );
}

export function TeacherPayoutsList({ payoutsState }: TeacherPayoutsListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (payoutsState.status === 'loading') {
    return <LoadingSkeleton />;
  }
  if (payoutsState.status === 'error') {
    return (
      <Alert severity="error">
        Failed to load payouts: {payoutsState.error}
      </Alert>
    );
  }
  if (payoutsState.status === 'idle') {
    return null;
  }
  if (payoutsState.data.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 6, color: 'text.secondary' }}>
        <Typography variant="body1">
          No payouts for this period.
        </Typography>
        <Typography variant="body2">
          Payouts come from paid private-pay invoices and rendered Hope
          Scholarship lessons. Make sure invoices are marked paid and Hope
          lessons are marked rendered.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {payoutsState.data.map((payout) => {
        const isExpanded = expandedId === payout.teacherId;
        return (
          <Accordion
            key={payout.teacherId}
            expanded={isExpanded}
            onChange={() =>
              setExpandedId(isExpanded ? null : payout.teacherId)
            }
            disableGutters
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack
                direction="row"
                spacing={2}
                alignItems="center"
                sx={{ width: '100%', flexWrap: 'wrap' }}
              >
                <Typography variant="subtitle1" sx={{ flex: 1 }}>
                  {payout.teacherName}
                </Typography>
                <Chip
                  size="small"
                  label={`${payout.lines.length} lesson${
                    payout.lines.length === 1 ? '' : 's'
                  }`}
                  variant="outlined"
                />
                <Typography variant="h6">
                  {formatCents(payout.totalOwedCents)}
                </Typography>
                {payout.missingRateConfig && (
                  <Chip
                    size="small"
                    icon={<WarningAmberIcon />}
                    label="Rate not set"
                    color="warning"
                    variant="outlined"
                  />
                )}
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              <TableContainer>
                <Table size="small" aria-label={`${payout.teacherName} payout lines`}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Date</TableCell>
                      <TableCell>Student</TableCell>
                      <TableCell>Duration</TableCell>
                      <TableCell>Source</TableCell>
                      <TableCell align="right">Base</TableCell>
                      <TableCell align="right">Owed</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {payout.lines.map((line) => (
                      <TableRow key={line.lessonId}>
                        <TableCell>{formatDate(line.scheduledAt)}</TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <span>{line.studentName}</span>
                            {line.asSubstitute && (
                              <Chip
                                label="Sub"
                                size="small"
                                color="info"
                                variant="outlined"
                              />
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell>{line.durationMinutes} min</TableCell>
                        <TableCell>
                          <SourceChip source={line.source} />
                        </TableCell>
                        <TableCell align="right">
                          {formatCents(line.baseRevenueCents)}
                        </TableCell>
                        <TableCell align="right">
                          {line.compensationCents === undefined
                            ? '—'
                            : formatCents(line.compensationCents)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Box>
  );
}
