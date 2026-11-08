'use client';

import { Box } from '@mui/material';
import { QRCodeSVG } from 'qrcode.react';
import { GIFT_CERTIFICATE_CLASSES_URL } from '@maple/ts/domain';
import {
  CERTIFICATE_LOGO_SRC,
  CERTIFICATE_SMALL_PRINT,
  CERTIFICATE_SPRIG_SRC,
  type GiftCertificateDesign,
} from './certificate-designs';
import { Code128Barcode } from './Code128Barcode';
import { formatGiftCardCode } from './format';

/**
 * Katie's certificate colours, read from her design (#314). Printed, not
 * themed: a certificate looks the same whatever the admin app's theme is.
 */
export const CERTIFICATE_COLORS = {
  paper: '#E5E7DF',
  brown: '#413023',
  sage: '#546346',
} as const;

const SERIF = 'Georgia, Times, "Times New Roman", serif';

interface GiftCertificatePageProps {
  design: GiftCertificateDesign;
  /** A dollar certificate shows its value big; a class one, the class. */
  kind: 'amount' | 'class';
  /** "$25" or "One Stained Glass class". */
  headline: string;
  /** The full card code. Shown grouped in fours, and as a barcode. */
  code: string;
}

/**
 * One printed gift certificate, exactly one US Letter page (8.5 x 11 in),
 * laid out after Katie's stained glass design. Every position is in points
 * (72 to the inch), so it prints where she put it.
 */
export function GiftCertificatePage({
  design,
  kind,
  headline,
  code,
}: GiftCertificatePageProps) {
  const isClass = kind === 'class';
  return (
    <Box
      component="article"
      aria-label={`Gift certificate, ${headline}`}
      className="gift-certificate-page"
      sx={{
        position: 'relative',
        width: '612pt',
        height: '792pt',
        overflow: 'hidden',
        bgcolor: CERTIFICATE_COLORS.paper,
        color: CERTIFICATE_COLORS.brown,
        fontFamily: SERIF,
        printColorAdjust: 'exact',
        WebkitPrintColorAdjust: 'exact',
        breakInside: 'avoid',
        // One certificate per sheet, without a blank sheet after the last.
        '&:not(:last-of-type)': { breakAfter: 'page' },
        '& p': { m: 0 },
      }}
    >
      <Box
        component="img"
        src={design.photoSrc}
        alt={design.photoAlt}
        sx={{
          position: 'absolute',
          left: '-14pt',
          top: '16pt',
          width: '392pt',
          height: '498pt',
          objectFit: 'contain',
          objectPosition: 'left top',
        }}
      />

      {/* Right column: what it is worth, what it is, and the code. */}
      <Box
        sx={{
          position: 'absolute',
          left: '300pt',
          width: '290pt',
          top: isClass ? '70pt' : '64pt',
          textAlign: 'center',
        }}
      >
        <Box
          component="p"
          sx={{
            fontWeight: 700,
            fontSize: isClass ? '40pt' : '72pt',
            lineHeight: 1.1,
            minHeight: isClass ? '96pt' : undefined,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
        >
          {headline}
        </Box>
        <Box
          component="p"
          sx={{ fontWeight: 700, fontSize: '54pt', lineHeight: 1.15, mt: '4pt' }}
        >
          Gift Card
        </Box>
        <Box
          component="p"
          sx={{
            color: CERTIFICATE_COLORS.sage,
            fontSize: '20pt',
            lineHeight: 1.3,
            mt: '6pt',
            px: '8pt',
          }}
        >
          {design.copy}
        </Box>
      </Box>

      <Box
        sx={{
          position: 'absolute',
          left: '300pt',
          width: '290pt',
          top: '362pt',
          textAlign: 'center',
        }}
      >
        <Box component="p" sx={{ fontWeight: 700, fontSize: '36pt', lineHeight: 1.15 }}>
          Code:
        </Box>
        <Box
          component="p"
          sx={{
            color: CERTIFICATE_COLORS.sage,
            fontSize: '24pt',
            letterSpacing: '0.02em',
            whiteSpace: 'nowrap',
            mt: '6pt',
          }}
        >
          {formatGiftCardCode(code)}
        </Box>
        <Box sx={{ mt: '10pt', display: 'flex', justifyContent: 'center' }}>
          <Code128Barcode
            value={code}
            height={52}
            barWidth={2}
            color={CERTIFICATE_COLORS.brown}
            label={`Barcode of the code ending ${code.slice(-4)}`}
          />
        </Box>
      </Box>

      {/* Bottom left: the studio's mark and name. */}
      <Box
        component="img"
        src={CERTIFICATE_LOGO_SRC}
        alt="Maple & Spruce logo: a maple leaf, a treble clef and a spruce sprig"
        sx={{
          position: 'absolute',
          left: '65pt',
          top: '541pt',
          width: '191pt',
          height: '146pt',
          objectFit: 'contain',
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          left: '40pt',
          width: '250pt',
          top: '690pt',
          textAlign: 'center',
          fontSize: '26pt',
          lineHeight: 1.25,
        }}
      >
        <Box component="p" sx={{ fontWeight: 700 }}>
          Maple &amp; Spruce
        </Box>
        <Box component="p" sx={{ color: CERTIFICATE_COLORS.sage }}>
          Folk Arts Collective
        </Box>
      </Box>

      <Box
        component="img"
        src={CERTIFICATE_SPRIG_SRC}
        alt=""
        sx={{
          position: 'absolute',
          left: '300pt',
          top: '542pt',
          width: '78pt',
          height: '212pt',
          objectFit: 'contain',
        }}
      />

      {/* Bottom right: where to find classes. */}
      <Box
        sx={{
          position: 'absolute',
          left: '415pt',
          top: '553pt',
          width: '160pt',
          color: CERTIFICATE_COLORS.sage,
          fontSize: '20pt',
          lineHeight: 1.15,
        }}
      >
        See all available classes here:
      </Box>
      <Box
        sx={{
          position: 'absolute',
          left: '415pt',
          top: '606pt',
          width: '146pt',
          height: '146pt',
          bgcolor: '#FFFFFF',
          p: '8pt',
          boxSizing: 'border-box',
          '& svg': { width: '100%', height: '100%', display: 'block' },
        }}
      >
        <QRCodeSVG
          value={GIFT_CERTIFICATE_CLASSES_URL}
          level="M"
          marginSize={0}
          title="QR code to the upcoming classes page"
        />
      </Box>

      <Box
        component="p"
        sx={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '764pt',
          textAlign: 'center',
          color: CERTIFICATE_COLORS.sage,
          fontSize: '10pt',
        }}
      >
        {CERTIFICATE_SMALL_PRINT}
      </Box>
    </Box>
  );
}
