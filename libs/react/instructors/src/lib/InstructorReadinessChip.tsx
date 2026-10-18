'use client';

import { Chip, Tooltip } from '@mui/material';
import {
  describeMissingReadiness,
  instructorReadiness,
  type Instructor,
} from '@maple/ts/domain';

/**
 * "Not ready" for a contract instructor who has not been cleared to teach,
 * with what is missing on hover. Renders nothing otherwise: a ready
 * instructor and a non-contractor need no badge.
 */
export function InstructorReadinessChip({
  instructor,
}: {
  instructor: Pick<Instructor, 'isContractor' | 'readiness'>;
}) {
  const status = instructorReadiness(instructor);
  if (status.kind !== 'not-ready') return null;

  const missing = describeMissingReadiness(status.missing);
  return (
    <Tooltip title={`Missing ${missing}`}>
      <Chip
        label="Not ready"
        size="small"
        color="warning"
        variant="outlined"
        aria-label={`Not ready to teach: missing ${missing}`}
      />
    </Tooltip>
  );
}
