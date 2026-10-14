'use client';

import type { ReactNode } from 'react';
import { Box } from '@mui/material';

/**
 * The Home dashboard's one grid (#235): three columns, two under 900px of
 * container width, one under 580px. `dense` packing lets a later two-column
 * card (Sales, PR 3) slot in without leaving holes; adding a card is just
 * another child.
 */
export function DashboardGrid({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ containerType: 'inline-size' }}>
      <Box
        data-testid="dashboard-grid"
        sx={{
          display: 'grid',
          gap: '18px',
          alignItems: 'start',
          gridAutoFlow: 'row dense',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          '@container (max-width: 900px)': {
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          },
          '@container (max-width: 580px)': {
            gridTemplateColumns: 'minmax(0, 1fr)',
          },
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
