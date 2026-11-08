/**
 * The customer's class confirmation email, whichever way they paid.
 *
 * Three paths confirm a class registration: the in-page card checkout
 * (`createRegistration`), the hosted-checkout fallback (a Square Payment Link,
 * confirmed by `processPosSale` when Square reports the payment) and an
 * in-store POS sale (also `processPosSale`). All three send the same
 * `registration-confirmation` mail, with the same data and the same `.ics`,
 * from here.
 *
 * Square retries webhooks, and a Firestore trigger can run twice, so a payment
 * must never send two confirmations. Each mail document gets a fixed id from
 * `idempotencyKey` and is written with `create()`: a second write for the same
 * key loses to the first and is dropped.
 */
import { getDb, isAlreadyExists } from '@maple/firebase/database';
import {
  cancelPageUrl,
  formatFreeCancellationDeadline,
  formatPrivateHour,
  formatSessions,
  freeCancellationUntil,
  isPrivateHoursClass,
  type Attendee,
  type Class,
} from '@maple/ts/domain';
import { isE2ETestEmail } from './email.utility';
import {
  confirmationCalendarAttachments,
  type MailAttachment,
} from './calendar-attachment.utility';

export interface RegistrationConfirmationInput {
  /**
   * Unique per confirmed purchase: the registration id, or for a POS sale the
   * payment and line item. The mail documents are named after it.
   */
  idempotencyKey: string;
  classEntity: Pick<
    Class,
    | 'name'
    | 'sessions'
    | 'durationMinutes'
    | 'location'
    | 'format'
    | 'materialsIncluded'
    | 'whatToBring'
  >;
  /** May be missing on a POS sale; the email then greets "Hi there". */
  customerName?: string;
  customerEmail: string;
  quantity: number;
  confirmationNumber: string;
  /** Private hours: the hour booked (ISO string or Date). */
  slotStart?: string | Date;
  additionalAttendees?: Attendee[];
  subtotalCents: number;
  taxRatePercent: number;
  taxAmountCents: number;
  amountPaidCents: number;
  receiptUrl?: string | null;
  /** Gift card checkout (#301). Last 4 only, never the full number. */
  giftCard?: {
    last4: string;
    paidCents: number;
    cardPaidCents: number;
    classCertificateCoverCents?: number | null;
  };
  agreementsSigned?: boolean;
  waiverUrl?: string;
  referral?: { code: string; expires: string; percent: number };
  /**
   * Show "Free cancellation until …" with a link to the website's cancel
   * page, while that date is still ahead. Web checkouts only: the cancel page
   * finds web registrations, not register sales.
   */
  offerFreeCancellation?: boolean;
}

export interface RegistrationConfirmationResult {
  /** Mail documents written by this call (0 when skipped or already sent). */
  queued: number;
}

const formatCurrency = (cents: number): string =>
  `$${(cents / 100).toFixed(2)}`;

function classDateLine(
  classEntity: RegistrationConfirmationInput['classEntity'],
  slotStart: string | Date | undefined
): string {
  // A private hour: the one hour this group booked, not every hour.
  if (slotStart && isPrivateHoursClass(classEntity)) {
    return formatPrivateHour(
      slotStart instanceof Date ? slotStart.toISOString() : slotStart,
      classEntity.durationMinutes
    );
  }
  const { dateDisplay, timeDisplay } = formatSessions(
    classEntity.sessions,
    'America/New_York'
  );
  return timeDisplay && timeDisplay !== 'Varies'
    ? `${dateDisplay} · ${timeDisplay}`
    : dateDisplay;
}

function classDurationLine(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} hour${hours > 1 ? 's' : ''}${rest ? ` ${rest} min` : ''}`;
}

/** Write one mail doc under a fixed id. False if that id was already sent. */
async function createMailOnce(
  docId: string,
  mail: Record<string, unknown>
): Promise<boolean> {
  try {
    await getDb().collection('mail').doc(docId).create(mail);
    return true;
  } catch (err) {
    if (isAlreadyExists(err)) {
      console.log(`[registration-confirmation] ${docId} already queued`);
      return false;
    }
    throw err;
  }
}

/**
 * Queue the registrant's confirmation and one class-details email per
 * additional attendee who gave an address.
 *
 * Never throws: the registration is paid for, and a mail failure must not
 * undo it or make a trigger retry the whole sale. Failures are logged.
 */
export async function queueRegistrationConfirmation(
  input: RegistrationConfirmationInput
): Promise<RegistrationConfirmationResult> {
  const email = input.customerEmail?.trim();
  if (!email) return { queued: 0 };
  // The registration E2E suite runs against dev, whose mail extension
  // delivers for real; its `.test` recipients would only bounce.
  if (isE2ETestEmail(email)) {
    console.log(
      `Skipping confirmation email queue for E2E test recipient ${email}`
    );
    return { queued: 0 };
  }

  let queued = 0;
  try {
    const { classEntity } = input;
    const classDate = classDateLine(classEntity, input.slotStart);
    const classDuration = classDurationLine(classEntity.durationMinutes);
    const classLocation = classEntity.location || 'Maple & Spruce';
    // Only while it is ahead: a booking inside the two weeks gets no
    // cancellation line at all.
    const cancelDeadline = input.offerFreeCancellation
      ? freeCancellationUntil(
          { sessions: classEntity.sessions, slotStart: input.slotStart },
          new Date()
        )
      : undefined;

    // Every session as an .ics, so the mail client offers "Add to Calendar"
    // whatever browser the buyer checked out in. A failure here must not cost
    // the buyer their confirmation email.
    let calendarAttachments: MailAttachment[] = [];
    try {
      calendarAttachments = confirmationCalendarAttachments(
        classEntity,
        input.confirmationNumber,
        input.slotStart instanceof Date
          ? input.slotStart.toISOString()
          : input.slotStart
      );
    } catch (calendarError) {
      console.error('Failed to build confirmation .ics:', calendarError);
    }
    const calendarMessage =
      calendarAttachments.length > 0
        ? { message: { attachments: calendarAttachments } }
        : {};

    // Attendees with an email get their own confirmation; those without
    // become a "remind your N friends" prompt to the registrant.
    const additionalAttendees = input.additionalAttendees ?? [];
    const attendeesWithEmail = additionalAttendees.filter(
      (a) => a.email && a.email.trim().length > 0
    );
    const extrasWithoutEmailCount =
      additionalAttendees.length - attendeesWithEmail.length;

    const customerName = input.customerName?.trim() || undefined;

    // Full roster: the purchaser first, then each attendee they entered.
    const attendees = [
      { name: customerName, email },
      ...additionalAttendees
        .map((a) => ({
          name: a.name?.trim() || undefined,
          email: a.email?.trim() || undefined,
        }))
        .filter((a) => a.name || a.email),
    ];

    const { giftCard, referral } = input;
    const sent = await createMailOnce(
      `registration-confirmation-${input.idempotencyKey}`,
      {
        to: email,
        ...calendarMessage,
        template: {
          name: 'registration-confirmation',
          data: {
            customerName: customerName ?? 'there',
            className: classEntity.name,
            classDate,
            classDuration,
            classLocation,
            confirmationNumber: input.confirmationNumber,
            freeCancellationUntil: cancelDeadline
              ? formatFreeCancellationDeadline(cancelDeadline)
              : undefined,
            cancelUrl: cancelDeadline
              ? cancelPageUrl(input.confirmationNumber)
              : undefined,
            subtotal: formatCurrency(input.subtotalCents),
            taxRate: input.taxRatePercent,
            taxAmount: formatCurrency(input.taxAmountCents),
            amountPaid: formatCurrency(input.amountPaidCents),
            ...(giftCard && {
              giftCardLast4: giftCard.last4,
              giftCardPaid: formatCurrency(giftCard.paidCents),
              cardPaid:
                giftCard.cardPaidCents > 0
                  ? formatCurrency(giftCard.cardPaidCents)
                  : undefined,
              classCertificateCover: giftCard.classCertificateCoverCents
                ? formatCurrency(giftCard.classCertificateCoverCents)
                : undefined,
            }),
            quantity: input.quantity,
            // A sandbox receipt link is useless to the buyer.
            receiptUrl: input.receiptUrl?.includes('squareupsandbox.com')
              ? undefined
              : input.receiptUrl ?? undefined,
            materialsIncluded: classEntity.materialsIncluded,
            whatToBring: classEntity.whatToBring,
            agreementsSigned: input.agreementsSigned || undefined,
            waiverUrl: input.waiverUrl,
            referralCode: referral?.code,
            referralExpires: referral?.expires,
            referralPercent: referral?.percent,
            extrasWithoutEmailCount:
              extrasWithoutEmailCount > 0 ? extrasWithoutEmailCount : undefined,
            extrasWithoutEmailNoun:
              extrasWithoutEmailCount === 1 ? 'friend' : 'friends',
            attendees,
          },
        },
      }
    );
    if (!sent) return { queued: 0 };
    queued++;

    // Per-attendee confirmation emails (class details only, no payment).
    for (const [index, attendee] of attendeesWithEmail.entries()) {
      try {
        const attendeeSent = await createMailOnce(
          `registration-confirmation-${input.idempotencyKey}-attendee-${index}`,
          {
            to: attendee.email?.trim(),
            ...calendarMessage,
            template: {
              name: 'registration-confirmation-attendee',
              data: {
                attendeeName: attendee.name?.trim() || undefined,
                registrantName: customerName,
                className: classEntity.name,
                classDate,
                classDuration,
                classLocation,
                materialsIncluded: classEntity.materialsIncluded,
                whatToBring: classEntity.whatToBring,
              },
            },
          }
        );
        if (attendeeSent) queued++;
      } catch (attendeeEmailError) {
        console.error(
          `Failed to queue attendee confirmation email ${index}:`,
          attendeeEmailError
        );
      }
    }
  } catch (emailError) {
    console.error('Failed to queue confirmation email:', emailError);
  }
  return { queued };
}
