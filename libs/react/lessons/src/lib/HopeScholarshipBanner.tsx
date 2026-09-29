'use client';

/**
 * What a Hope Scholarship student is billed as, at a glance.
 *
 * The one fact Katie needs on the student page is which EMA product this
 * student's lessons go under and what EMA pays for it. The billing rules are
 * fixed (ESP Handbook, legacy #282) and read once, so they fold away instead of
 * taking up the top of every Hope student's page.
 *
 * With no product set the price shown is only the old length-table estimate,
 * and the banner says so plainly, because an estimate that looks like a fact
 * is how a $30 lesson came to be shown as $41.25.
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
import type { HopeProduct, LessonLength } from '@maple/ts/domain';
import { formatHopePrice, resolveHopeLessonRate } from '@maple/ts/domain';

export interface HopeScholarshipBannerProps {
  /** The student's EMA product id, if one is set. */
  hopeProductId?: string;
  /** Every EMA product, to look the student's up. */
  products?: HopeProduct[];
  /** Used only for the estimate when no product is set. */
  registeredLessonLength?: LessonLength;
  /** Open the student form to choose a product. */
  onChooseProduct?: () => void;
  /** Default expanded state for the billing rules. Defaults to collapsed. */
  defaultRulesExpanded?: boolean;
}

export function HopeScholarshipBanner({
  hopeProductId,
  products = [],
  registeredLessonLength,
  onChooseProduct,
  defaultRulesExpanded = false,
}: HopeScholarshipBannerProps) {
  const [rulesOpen, setRulesOpen] = useState(defaultRulesExpanded);
  const rate = resolveHopeLessonRate(
    { hopeProductId, registeredLessonLength },
    { durationMinutes: 30 },
    new Map(products.map((p) => [p.id, p]))
  );

  return (
    <Alert
      severity={rate.product ? 'info' : 'warning'}
      icon={<StarsIcon />}
      sx={{ mb: 3, alignItems: 'flex-start' }}
    >
      <AlertTitle>WV Hope Scholarship</AlertTitle>
      <Typography variant="body2" sx={{ mb: 1 }}>
        Billed in the EMA portal, one lesson at a time after it is taught.
        No-shows are never billed.
      </Typography>

      {rate.product ? (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
          <Chip
            size="small"
            color="info"
            label={`${rate.product.name} · ${formatHopePrice(rate.rateCents)} / lesson`}
          />
          <Chip
            size="small"
            variant="outlined"
            label={`EMA product ${rate.product.emaProductId}`}
          />
        </Box>
      ) : (
        <Box sx={{ mb: 1 }}>
          <Typography variant="body2">
            <strong>No EMA product set.</strong>{' '}
            {formatHopePrice(rate.rateCents)} / lesson is only an estimate; set
            the product this student is billed under so lessons are priced at
            what EMA pays.
          </Typography>
          {onChooseProduct && (
            <Button size="small" onClick={onChooseProduct} sx={{ mt: 0.5 }}>
              Choose EMA product
            </Button>
          )}
        </Box>
      )}

      <Button
        size="small"
        onClick={() => setRulesOpen((v) => !v)}
        startIcon={rulesOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        aria-expanded={rulesOpen}
        aria-controls="hope-billing-rules"
      >
        {rulesOpen ? 'Hide billing rules' : 'Billing rules'}
      </Button>
      <Collapse in={rulesOpen} id="hope-billing-rules">
        <Box component="ul" sx={{ pl: 2, mt: 1, mb: 0 }}>
          <li>
            <Typography variant="body2">
              Invoice <strong>per lesson after it is taught</strong>, not
              monthly in advance.
            </Typography>
          </li>
          <li>
            <Typography variant="body2">
              Hope funds cannot be kept for lessons not given, so only lessons
              marked taught are billed.
            </Typography>
          </li>
          <li>
            <Typography variant="body2">
              Refunds credit back to the Hope account, not to the parent.
            </Typography>
          </li>
          <li>
            <Typography variant="body2">
              The 30-day post-termination tuition in the studio policy is{' '}
              <strong>private-pay only</strong>; it cannot be drawn from Hope.
            </Typography>
          </li>
        </Box>
      </Collapse>
    </Alert>
  );
}
