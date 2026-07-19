/**
 * Business payment config (#631).
 *
 * Small admin-configured settings for how the studio takes in-person payment.
 * Today: the business Venmo handle, rendered as a scannable QR on the teacher
 * "My Day" page so a student can pay by Venmo at their lesson.
 */
export interface BusinessPaymentConfig {
  /** The business Venmo username (stored without the leading @). A QR to
   *  `venmo.com/u/<handle>` is shown to students. */
  venmoHandle?: string;
  updatedAt?: Date;
  updatedByUid?: string;
}
