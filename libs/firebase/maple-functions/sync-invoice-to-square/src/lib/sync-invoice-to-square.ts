/**
 * Sync Invoice to Square Cloud Function
 *
 * Firestore trigger that pushes private-pay invoice lifecycle events
 * to Square's Invoices API:
 * - draft → sent: create Square customer (upsert by email), order, and
 *   invoice; publish it so Square emails the parent a hosted payment
 *   page. Stamp squareOrderId + squareInvoiceId back on the Firestore
 *   doc.
 * - sent → void (before payment): cancel the Square invoice.
 * - Anything else: no-op. Paid transitions flow back in via the
 *   square-webhook handler; we don't re-sync on paid.
 *
 * Errors are logged and persisted on the invoice (`squareSyncError`) so
 * Katie can retry from the admin UI without digging through function logs.
 */
import {
  onDocumentWritten,
  type Change,
  type DocumentSnapshot,
} from 'firebase-functions/v2/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import type { Invoice } from '@maple/ts/domain';
import {
  Square,
  SQUARE_SECRET_NAMES,
  SQUARE_STRING_NAMES,
} from '@maple/firebase/square';
import {
  InvoiceRepository,
  StudentRepository,
} from '@maple/firebase/database';

const squareSecretParams = SQUARE_SECRET_NAMES.map((name) => defineSecret(name));
const squareStringParams = SQUARE_STRING_NAMES.map((name) => defineString(name));

/** gRPC NOT_FOUND — Firestore throws this from `update()` when the doc is gone. */
const GRPC_NOT_FOUND = 5;

function isFirestoreNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === GRPC_NOT_FOUND
  );
}

/**
 * Run a writeback to a doc whose existence we already confirmed (the
 * trigger fired because it existed). If the doc has since been deleted
 * — test cleanup, admin churn, rapid status flips — Firestore throws
 * NOT_FOUND. That's benign here, but log loudly with `context` so any
 * unexpected occurrence stays visible. Rethrow anything else.
 *
 * The swallow lives at this layer, not in the repository: a generic
 * `update(id)` can't tell "benign mid-sync delete" apart from "caller
 * bug with the wrong id", so a repo-level swallow would silence real
 * bugs. Here we have positive context — we know we just synced this
 * exact invoice with Square — and can swallow narrowly.
 */
async function tolerateMidSyncDelete(
  invoiceId: string,
  context: string,
  fn: () => Promise<void>
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (isFirestoreNotFound(err)) {
      console.warn(
        `[sync-invoice] ${invoiceId} ${context}: invoice deleted mid-sync, dropping writeback`
      );
      return;
    }
    throw err;
  }
}

/** Firestore Timestamp-ish → Date helper. */
function toDateLike(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate: unknown }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : undefined;
  }
  return undefined;
}

function extractInvoice(snapshot?: DocumentSnapshot): Invoice | undefined {
  if (!snapshot?.exists) return undefined;
  const data = snapshot.data();
  if (!data) return undefined;

  const paymentRecord = data['paymentRecord'] as
    | {
        source: 'admin-manual' | 'square-webhook';
        squarePaymentId?: string;
        recordedAt: unknown;
      }
    | undefined;

  return {
    id: snapshot.id,
    studentId: data['studentId'],
    status: data['status'],
    lineItems: data['lineItems'] ?? [],
    totalCents: data['totalCents'] ?? 0,
    issuedAt: toDateLike(data['issuedAt']),
    paidAt: toDateLike(data['paidAt']),
    paymentRecord: paymentRecord
      ? {
          source: paymentRecord.source,
          squarePaymentId: paymentRecord.squarePaymentId,
          recordedAt: toDateLike(paymentRecord.recordedAt) ?? new Date(),
        }
      : undefined,
    squareOrderId: data['squareOrderId'],
    squareInvoiceId: data['squareInvoiceId'],
    squareSyncError: data['squareSyncError'],
    notes: data['notes'],
    createdAt: toDateLike(data['createdAt']) ?? new Date(),
    updatedAt: toDateLike(data['updatedAt']) ?? new Date(),
  };
}

export const syncInvoiceToSquare = onDocumentWritten(
  {
    document: 'invoices/{invoiceId}',
    region: 'us-east4',
    secrets: squareSecretParams,
  },
  async (event) => {
    const change: Change<DocumentSnapshot> = event.data!;
    const before = extractInvoice(change.before);
    const after = extractInvoice(change.after);
    const invoiceId = event.params.invoiceId;

    // Doc deleted or never existed — nothing to sync.
    if (!after) {
      console.log(`[sync-invoice] ${invoiceId} deleted, no-op`);
      return;
    }

    const needsSend =
      after.status === 'sent' && !after.squareInvoiceId && !after.squareSyncError;

    const needsCancel =
      after.status === 'void' &&
      before?.status !== 'void' &&
      !!after.squareInvoiceId &&
      // Don't try to cancel an already-paid Square invoice — Square rejects it.
      before?.status !== 'paid';

    if (!needsSend && !needsCancel) {
      console.log(
        `[sync-invoice] ${invoiceId} no action (status=${after.status}, squareInvoiceId=${after.squareInvoiceId ?? '∅'})`
      );
      return;
    }

    // Build Square client at trigger time (secrets resolve here, not at cold start)
    const secrets = Object.fromEntries(
      squareSecretParams.map((s) => [s.name, s.value()])
    ) as Record<(typeof SQUARE_SECRET_NAMES)[number], string>;

    const strings = Object.fromEntries(
      squareStringParams.map((s) => [s.name, s.value()])
    ) as Record<(typeof SQUARE_STRING_NAMES)[number], string>;

    const square = new Square(secrets, strings);

    if (needsSend) {
      try {
        const student = await StudentRepository.findById(after.studentId);
        if (!student) {
          throw new Error(`Student not found: ${after.studentId}`);
        }
        if (student.isHopeScholarship) {
          throw new Error(
            'Hope Scholarship students must not flow through Square invoicing'
          );
        }

        const result = await square.invoicesService.sendInvoice({
          locationId: square.locationId,
          idempotencyKey: invoiceId,
          customer: {
            email: student.primaryContactEmail,
            name: student.primaryContactName,
            phone: student.primaryContactPhone,
          },
          title: `Music lessons — ${student.name}`,
          description: after.notes,
          lineItems: after.lineItems.map((line) => ({
            name: line.description,
            quantity: String(line.quantity),
            unitAmountCents: line.unitAmountCents,
          })),
        });

        await tolerateMidSyncDelete(invoiceId, 'send-success writeback', () =>
          InvoiceRepository.markSquareSynced({
            id: invoiceId,
            squareOrderId: result.squareOrderId,
            squareInvoiceId: result.squareInvoiceId,
          })
        );

        console.log(
          `[sync-invoice] ${invoiceId} sent via Square (invoice=${result.squareInvoiceId})`
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown Square sync error';
        console.error(`[sync-invoice] ${invoiceId} send failed:`, message);
        await tolerateMidSyncDelete(invoiceId, 'send-error writeback', () =>
          InvoiceRepository.recordSquareSyncError({
            id: invoiceId,
            error: message,
          })
        );
      }
      return;
    }

    if (needsCancel && after.squareInvoiceId) {
      try {
        await square.invoicesService.cancelInvoice(after.squareInvoiceId);
        await tolerateMidSyncDelete(invoiceId, 'cancel-success writeback', () =>
          InvoiceRepository.recordSquareSyncError({
            id: invoiceId,
            error: '',
          })
        );
        console.log(
          `[sync-invoice] ${invoiceId} cancelled on Square (invoice=${after.squareInvoiceId})`
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown Square sync error';
        console.error(`[sync-invoice] ${invoiceId} cancel failed:`, message);
        await tolerateMidSyncDelete(invoiceId, 'cancel-error writeback', () =>
          InvoiceRepository.recordSquareSyncError({
            id: invoiceId,
            error: message,
          })
        );
      }
    }
  }
);
