/**
 * Gallery image — a single image with required alt text.
 *
 * Used by Class and ClassCategory for image galleries. Order is encoded
 * by array position; reordering rewrites the array.
 */
export interface GalleryImage {
  url: string;
  alt: string;
}

/** Maximum number of gallery images on a single Class or ClassCategory. */
export const GALLERY_IMAGE_MAX = 10;
