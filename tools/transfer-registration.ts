/**
 * Transfer a customer's registration from one class to another without
 * issuing a refund.
 *
 * Use when a customer wants to switch classes and the payment difference
 * is settled out-of-band (e.g., a separate Square invoice for the balance,
 * or an in-store refund). The script:
 *
 *   1. Cancels the source registration (status='cancelled', no refund).
 *      The seat is freed automatically because capacity is derived from
 *      pending+confirmed registrations.
 *   2. Creates a new registration on the target class, copying every field
 *      from the source (customer, Square payment, confirmation number,
 *      attribution) so refunds and reconciliation still resolve to a real
 *      payment and the conversion trigger dedups instead of double-counting.
 *   3. Queues a custom "your spot is reserved" confirmation email — no
 *      price line, since the customer's payment situation is unusual
 *      (split across transactions / invoice still outstanding).
 *
 * Usage:
 *   npx tsx tools/transfer-registration.ts --from=<regId> --to=<classId>
 *   npx tsx tools/transfer-registration.ts --from=<regId> --to=<classId> --apply
 *   npx tsx tools/transfer-registration.ts --from=<regId> --to=<classId> --prod --apply
 *
 * Dry-run (default) — pass --apply to actually write changes.
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const isProd = process.argv.includes('--prod');
const apply = process.argv.includes('--apply');

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const match = process.argv.find((a) => a.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

const fromRegId = argValue('from');
const toClassId = argValue('to');

if (!fromRegId || !toClassId) {
  console.error(
    'Usage: npx tsx tools/transfer-registration.ts --from=<regId> --to=<classId> [--prod] [--apply]'
  );
  process.exit(1);
}

const projectId = isProd ? 'maple-and-spruce' : 'maple-and-spruce-dev';

console.log(`Project: ${projectId}`);
console.log(`Mode:    ${apply ? 'APPLY' : 'DRY RUN (pass --apply to write changes)'}`);
console.log();

const app = initializeApp({ projectId });
const db = getFirestore(app);

function formatDuration(mins: number): string {
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h} hour${h > 1 ? 's' : ''}${m ? ` ${m} min` : ''}`;
  }
  return `${mins} minutes`;
}

function formatSession(dateTime: Date): string {
  return dateTime.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function toDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value as string);
}

async function main(): Promise<void> {
  // 1. Load source registration.
  const fromRef = db.collection('registrations').doc(fromRegId!);
  const fromSnap = await fromRef.get();
  if (!fromSnap.exists) {
    console.error(`Source registration ${fromRegId} not found.`);
    process.exit(1);
  }
  const source = fromSnap.data()!;

  if (source.status === 'cancelled' || source.status === 'refunded') {
    console.error(`Source registration is already ${source.status}.`);
    process.exit(1);
  }

  // 2. Load source + target classes.
  const [fromClassSnap, toClassSnap] = await Promise.all([
    db.collection('classes').doc(source.classId).get(),
    db.collection('classes').doc(toClassId!).get(),
  ]);
  if (!toClassSnap.exists) {
    console.error(`Target class ${toClassId} not found.`);
    process.exit(1);
  }
  const fromClass = fromClassSnap.exists ? fromClassSnap.data() : undefined;
  const toClass = toClassSnap.data()!;

  // 3. Capacity check on target.
  const occupied = await db
    .collection('registrations')
    .where('classId', '==', toClassId)
    .where('status', 'in', ['pending', 'confirmed'])
    .get();
  const seatsTaken = occupied.docs.reduce(
    (sum, d) => sum + ((d.data().quantity as number) ?? 0),
    0
  );
  const seatsLeft = (toClass.capacity as number) - seatsTaken;
  const needed = source.quantity as number;
  if (seatsLeft < needed) {
    console.error(
      `Target class has ${seatsLeft} seat(s) left, need ${needed}. Aborting.`
    );
    process.exit(1);
  }

  // 4. Plan output.
  console.log('Plan');
  console.log('----');
  console.log(`Customer:    ${source.customerName} <${source.customerEmail}>`);
  console.log(`Quantity:    ${needed}`);
  console.log(
    `From class:  ${fromClass?.name ?? '(unknown)'} (${source.classId})`
  );
  console.log(`To class:    ${toClass.name} (${toClassId})`);
  console.log(`Seats left:  ${seatsLeft} → ${seatsLeft - needed}`);
  console.log(`Source reg:  ${fromRegId} → status=cancelled (no refund)`);
  console.log(
    `New reg:     status=confirmed, copying pricePaidCents=${source.pricePaidCents}, squarePaymentId=${source.squarePaymentId ?? '(none)'}`
  );
  console.log();

  if (!apply) {
    console.log('Dry run — pass --apply to execute.');
    return;
  }

  // 5. Execute writes.
  const now = Timestamp.now();
  const today = new Date().toISOString().slice(0, 10);
  const newRegRef = db.collection('registrations').doc();

  const transferIn = `Transferred from registration ${fromRegId} (class ${source.classId}) on ${today}. Original Square payment: ${source.squarePaymentId ?? '(none)'}.`;
  const transferOut = `Transferred to class ${toClassId}, new registration ${newRegRef.id} on ${today}.`;

  const batch = db.batch();

  batch.update(fromRef, {
    status: 'cancelled',
    notes: source.notes ? `${source.notes}\n\n${transferOut}` : transferOut,
    updatedAt: now,
  });

  // Copy every field from the source, not an allowlist. `source` and
  // `confirmationNumber` matter most: `sendRegistrationConversion` fires on
  // the new doc going confirmed, and without them it reads as a fresh web
  // purchase with no dedup id, so Meta/GA4 count the sale a second time.
  // Attribution (fbc, fbp, gaClientId, …) and attendees belong to the
  // purchase too, so they move with it.
  const newReg: Record<string, unknown> = {
    ...source,
    classId: toClassId,
    status: 'confirmed',
    notes: source.notes ? `${source.notes}\n\n${transferIn}` : transferIn,
    createdAt: now,
    updatedAt: now,
  };

  batch.set(newRegRef, newReg);
  await batch.commit();

  console.log(`✓ Cancelled ${fromRegId}`);
  console.log(`✓ Created   ${newRegRef.id}`);

  // 6. Queue a custom "spot reserved" email — inline message, no template,
  //    so we can omit price info cleanly.
  const sessions = (toClass.sessions as Array<{ dateTime: unknown }>) ?? [];
  const sessionLines = sessions
    .map((s) => formatSession(toDate(s.dateTime)))
    .map((d) => `<tr><td style="padding: 6px 16px 6px 0; color: #7A7A6E;">When</td><td>${d}</td></tr>`)
    .join('');

  const location =
    (toClass.location as string) ||
    'Maple &amp; Spruce, 688 Beulah Rd, Morgantown, WV';

  const html = `<!DOCTYPE html>
<html lang="en">
<body style="font-family: Georgia, 'Times New Roman', serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #4A3728; line-height: 1.6;">
  <h2 style="color: #4A3728; margin-top: 0;">Your spot is reserved</h2>
  <p>Hi ${source.customerName},</p>
  <p>You're all set for <strong>${toClass.name}</strong>. We've reserved your spot — see you there!</p>

  <table style="border-collapse: collapse; margin: 16px 0;">
    <tr><td style="padding: 6px 16px 6px 0; color: #7A7A6E;">Class</td><td>${toClass.name}</td></tr>
    ${sessionLines}
    <tr><td style="padding: 6px 16px 6px 0; color: #7A7A6E;">Duration</td><td>${formatDuration(toClass.durationMinutes as number)} per session</td></tr>
    <tr><td style="padding: 6px 16px 6px 0; color: #7A7A6E;">Location</td><td>${location}</td></tr>
  </table>

  ${toClass.materialsIncluded ? `<p><strong>Materials included:</strong> ${toClass.materialsIncluded}</p>` : ''}
  ${toClass.whatToBring ? `<p><strong>What to bring:</strong> ${toClass.whatToBring}</p>` : ''}

  <p>If you have any questions, reply to this email or call us at <a href="tel:+13043144506" style="color: #6B7B5E;">304-314-4506</a>.</p>
  <p style="color: #7A7A6E;">— The Maple &amp; Spruce team</p>
</body>
</html>`;

  await db.collection('mail').add({
    to: source.customerEmail,
    message: {
      subject: `Your spot is reserved: ${toClass.name}`,
      html,
    },
  });

  console.log(`✓ Queued confirmation email to ${source.customerEmail}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
