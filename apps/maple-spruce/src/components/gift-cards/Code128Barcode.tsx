'use client';

import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

interface Code128BarcodeProps {
  /**
   * What the barcode encodes: the card code without spaces, e.g. Square's 16
   * digits or a printed certificate's 12 characters, `MAPLE2026482` (#332).
   */
  value: string;
  /** Bar height in px at screen scale. */
  height?: number;
  /** Narrowest bar in px at screen scale. */
  barWidth?: number;
  /** Ink colour. */
  color?: string;
  /** Read by screen readers instead of the bars. */
  label: string;
}

/**
 * A Code 128 barcode of a gift card code (#314), drawn as SVG so it prints
 * sharp at any size. The register scans it like the code on a Square card.
 * For an all-digit code JsBarcode picks Code 128 C, which is the most compact;
 * for a certificate code with letters it picks Code 128 B.
 */
export function Code128Barcode({
  value,
  height = 56,
  barWidth = 2,
  color = '#000000',
  label,
}: Code128BarcodeProps) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    JsBarcode(ref.current, value.replace(/\s+/g, ''), {
      format: 'CODE128',
      displayValue: false,
      margin: 0,
      height,
      width: barWidth,
      lineColor: color,
      background: 'transparent',
    });
  }, [value, height, barWidth, color]);

  return <svg ref={ref} role="img" aria-label={label} />;
}
