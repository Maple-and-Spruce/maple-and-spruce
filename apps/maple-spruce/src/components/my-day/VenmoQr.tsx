'use client';

import { Box, Typography } from '@mui/material';
import { QRCodeSVG } from 'qrcode.react';
import { fonts } from '@maple/react/theme';

/**
 * Scannable QR to the business Venmo profile, shown so a student can pay by
 * Venmo at their lesson (#631). Scanning opens venmo.com/u/<handle>.
 */
export function VenmoQr({ handle, size = 200 }: { handle: string; size?: number }) {
  const url = `https://venmo.com/u/${handle}`;
  return (
    <Box sx={{ textAlign: 'center' }}>
      <Box
        sx={{
          display: 'inline-block',
          p: 2,
          bgcolor: '#fff',
          borderRadius: 1,
        }}
      >
        <QRCodeSVG value={url} size={size} />
      </Box>
      <Typography sx={{ mt: 1, fontFamily: fonts.mono }}>@{handle}</Typography>
      <Typography variant="caption" color="text.secondary" display="block">
        Scan to pay via Venmo
      </Typography>
    </Box>
  );
}
