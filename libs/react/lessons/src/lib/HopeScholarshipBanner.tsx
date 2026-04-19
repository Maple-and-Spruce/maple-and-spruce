'use client';

/**
 * Banner shown on a Hope Scholarship student's pages explaining the
 * external-invoicing / per-rendered-lesson billing rules, and surfacing
 * the current per-lesson rate plus an expandable rates table.
 *
 * Billing rules are frozen in the component copy (not fetched) — they come
 * from the ESP Handbook and the studio policy tension documented in #282.
 */

import { useState } from 'react';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  Collapse,
  Typography,
} from '@mui/material';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import StarsIcon from '@mui/icons-material/Stars';
import type { LessonLength } from '@maple/ts/domain';
import { HopeRatesTable } from './HopeRatesTable';
import {
  formatCents,
  getHopeMonthlyEquivalentCents,
  getHopePerLessonRateCents,
} from './hope-rates';

interface HopeScholarshipBannerProps {
  /**
   * The student's registered tier. When present, the current rate is
   * called out inline and the rates table highlights the matching row.
   */
  registeredLessonLength?: LessonLength;
  /** Default expanded state for the rates table. Defaults to collapsed. */
  defaultRatesExpanded?: boolean;
}

export function HopeScholarshipBanner({
  registeredLessonLength,
  defaultRatesExpanded = false,
}: HopeScholarshipBannerProps) {
  const [ratesExpanded, setRatesExpanded] = useState(defaultRatesExpanded);

  const perLessonCents = registeredLessonLength
    ? getHopePerLessonRateCents(registeredLessonLength)
    : undefined;
  const monthlyCents = registeredLessonLength
    ? getHopeMonthlyEquivalentCents(registeredLessonLength)
    : undefined;

  return (
    <Alert
      severity="info"
      icon={<StarsIcon />}
      sx={{ mb: 3, alignItems: 'flex-start' }}
    >
      <AlertTitle>WV Hope Scholarship student</AlertTitle>
      <Typography variant="body2" sx={{ mb: 1 }}>
        Invoicing goes through the Hope / EMA portal —{' '}
        <strong>not</strong> through Maple &amp; Spruce.
      </Typography>
      <Box component="ul" sx={{ pl: 2, mt: 0, mb: 1 }}>
        <li>
          <Typography variant="body2">
            Invoice <strong>per lesson after it is rendered</strong>, not
            monthly in advance.
          </Typography>
        </li>
        <li>
          <Typography variant="body2">
            Hope funds cannot be retained for services not rendered — only
            bill for lessons marked <em>rendered</em> below.
          </Typography>
        </li>
        <li>
          <Typography variant="body2">
            Refunds credit back to the Hope account, not to the parent.
          </Typography>
        </li>
        <li>
          <Typography variant="body2">
            Post-termination 30-day tuition in the studio policy is{' '}
            <strong>private-pay only</strong>; it cannot be drawn from Hope.
          </Typography>
        </li>
      </Box>

      {perLessonCents !== undefined && monthlyCents !== undefined && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
          <Chip
            label={`Current rate: ${formatCents(perLessonCents)} / lesson`}
            color="info"
            size="small"
          />
          <Chip
            label={`Monthly equiv: ${formatCents(monthlyCents)}`}
            variant="outlined"
            size="small"
          />
        </Box>
      )}

      <Button
        size="small"
        onClick={() => setRatesExpanded((v) => !v)}
        startIcon={
          ratesExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />
        }
        sx={{ mt: 0.5 }}
        aria-expanded={ratesExpanded}
        aria-controls="hope-rates-details"
      >
        {ratesExpanded ? 'Hide all rates' : 'View all rates'}
      </Button>
      <Collapse in={ratesExpanded} id="hope-rates-details">
        <Box sx={{ mt: 2 }}>
          <HopeRatesTable
            highlightTier={registeredLessonLength}
            heading={null}
          />
        </Box>
      </Collapse>
    </Alert>
  );
}
