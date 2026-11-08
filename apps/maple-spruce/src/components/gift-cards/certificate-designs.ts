/**
 * Printed gift certificate designs (#314).
 *
 * Each design is artwork plus the words around it. The server only knows the
 * ids (`GIFT_CERTIFICATE_DESIGN_IDS` in the domain lib), so a batch always
 * names a design this registry can draw. To add one: add its id there, its
 * artwork under `certificate-art/` (imported, so the build bundles it: the
 * deployed admin does not serve `public/`), and an entry here.
 *
 * Copy rules: plain words, no em dashes.
 */
import type { GiftCertificateDesignId } from '@maple/ts/domain';
import stainedGlassLeaves from './certificate-art/stained-glass-leaves.webp';
import mapleSpruceMark from './certificate-art/maple-spruce-mark.webp';
import botanicalSprig from './certificate-art/botanical-sprig.webp';

/**
 * An imported image's URL. Next.js gives `{ src }`; Storybook's Vite gives
 * the URL string itself.
 */
function imageUrl(image: string | { src: string }): string {
  return typeof image === 'string' ? image : image.src;
}

export interface GiftCertificateDesign {
  id: GiftCertificateDesignId;
  /** What Katie sees in the dialog. */
  name: string;
  /** The photo on the left half of the page, with a transparent background. */
  photoSrc: string;
  photoAlt: string;
  /** The line under "Gift Card". */
  copy: string;
}

/** The line under "Gift Card" when a design does not set its own. */
export const DEFAULT_CERTIFICATE_COPY =
  'Good for classes and handmade goods at Maple & Spruce';

/** The small print at the foot of every certificate. */
export const CERTIFICATE_SMALL_PRINT =
  'Never expires. Not redeemable for cash. Not valid for Music Together.';

/** The studio's mark and the sprig, shared by every design. */
export const CERTIFICATE_LOGO_SRC = imageUrl(mapleSpruceMark);
export const CERTIFICATE_SPRIG_SRC = imageUrl(botanicalSprig);

export const GIFT_CERTIFICATE_DESIGNS: Record<
  GiftCertificateDesignId,
  GiftCertificateDesign
> = {
  'stained-glass': {
    id: 'stained-glass',
    name: 'Stained glass leaves',
    photoSrc: imageUrl(stainedGlassLeaves),
    photoAlt: 'A hand holding stained glass leaves in green, gold and red',
    copy: DEFAULT_CERTIFICATE_COPY,
  },
};

export const GIFT_CERTIFICATE_DESIGN_LIST = Object.values(GIFT_CERTIFICATE_DESIGNS);

/**
 * The big line at the top: "$25" for a dollar certificate (cents only when
 * there are some), or "One Stained Glass class" for a class certificate.
 */
export function certificateHeadline(input: {
  kind: 'amount' | 'class';
  valueCents: number;
  className?: string;
}): string {
  if (input.kind === 'class' && input.className) {
    return `One ${input.className} class`;
  }
  const dollars = input.valueCents / 100;
  return Number.isInteger(dollars)
    ? `$${dollars.toLocaleString('en-US')}`
    : `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
