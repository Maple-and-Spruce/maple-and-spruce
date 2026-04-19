'use client';

import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import StarsIcon from '@mui/icons-material/Stars';
import type { LessonLength } from '@maple/ts/domain';
import { LESSON_LENGTHS } from '@maple/ts/domain';
import {
  formatCents,
  HOPE_MONTHLY_EQUIVALENT_CENTS,
  HOPE_PER_LESSON_RATE_CENTS,
} from './hope-rates';

interface HopeRatesTableProps {
  /**
   * If provided, the corresponding row is highlighted to draw Katie's eye
   * to the student's current tier.
   */
  highlightTier?: LessonLength;
  /**
   * Optional section heading rendered above the table. Pass `null` to
   * suppress. Defaults to "WV Hope per-lesson rates".
   */
  heading?: string | null;
}

const TIER_LABELS: Record<LessonLength, string> = {
  '30-min-initial': '30 min (initial — no group class)',
  '30-min-full': '30 min (full — with group class + recitals)',
  '45-min': '45 min',
  '60-min': '60 min',
};

export function HopeRatesTable({
  highlightTier,
  heading = 'WV Hope per-lesson rates',
}: HopeRatesTableProps) {
  return (
    <Box>
      {heading !== null && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <StarsIcon fontSize="small" color="info" />
          <Typography variant="overline" color="text.secondary">
            {heading}
          </Typography>
        </Box>
      )}
      <TableContainer>
        <Table size="small" aria-label="Hope Scholarship per-lesson rates">
          <TableHead>
            <TableRow>
              <TableCell>Lesson length</TableCell>
              <TableCell align="right">Per lesson</TableCell>
              <TableCell align="right">
                Monthly equivalent (4 lessons)
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {LESSON_LENGTHS.map((tier) => {
              const isHighlighted = tier === highlightTier;
              return (
                <TableRow
                  key={tier}
                  selected={isHighlighted}
                  sx={
                    isHighlighted
                      ? {
                          bgcolor: 'action.selected',
                          '& td': { fontWeight: 600 },
                        }
                      : undefined
                  }
                >
                  <TableCell>{TIER_LABELS[tier]}</TableCell>
                  <TableCell align="right">
                    {formatCents(HOPE_PER_LESSON_RATE_CENTS[tier])}
                  </TableCell>
                  <TableCell align="right">
                    {formatCents(HOPE_MONTHLY_EQUIVALENT_CENTS[tier])}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mt: 1 }}
      >
        Rates assume ~4 lessons per month. Update if studio pricing changes.
      </Typography>
    </Box>
  );
}
