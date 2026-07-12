/**
 * Integration tests for the `syncClassInventoryToSquare` Firestore trigger.
 *
 * Exercises the REAL chain end-to-end against the Firebase emulator:
 *
 *   Firestore write (registrations/{id})  →  syncClassInventoryToSquare fires
 *   in the maple-square functions emulator  →  it reads the class + recomputes
 *   RegistrationRepository.countByClassId  →  its `new Square(...)` client
 *   PHYSICAL_COUNTs the class variation to (capacity - count) on the Square
 *   mock server (redirected via SQUARE_BASE_URL).
 *
 * To isolate THIS trigger from the sibling `syncClassToSquare` (class-write)
 * trigger, we seed the already-synced class first, let its inventory-seeding
 * write settle, then RESET the Square mock — so only registration-triggered
 * inventory calls are observed.
 *
 * NOTE: requires the maple-square codebase to be built and loaded in the
 * emulator, and the Square mock server running on 9997(+offset). The harness
 * (`tools/run-integration-tests.sh class-square`) sets all of this up.
 */
import {
  clearFirestoreEmulator,
  setFirestoreDoc,
  EMULATOR_CONFIG,
  PUBLISHED_CLASS,
} from '@maple/firebase/integration-test-utils';

const squareMockUrl = EMULATOR_CONFIG.squareMockServerUrl;

interface RecordedRequest {
  method: string;
  path: string;
  body: unknown;
}

/** Wait for the async Firestore trigger + Square round-trip to complete. */
function waitForTrigger(ms = 5000): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resetSquareMock(): Promise<void> {
  const res = await fetch(`${squareMockUrl}/_mock/reset`, { method: 'POST' });
  if (!res.ok) {
    throw new Error(`Square mock reset failed: ${res.status}`);
  }
}

async function getSquareRequests(pathPrefix?: string): Promise<RecordedRequest[]> {
  const res = await fetch(`${squareMockUrl}/_mock/requests`);
  if (!res.ok) {
    throw new Error(`Square mock requests failed: ${res.status}`);
  }
  const body = (await res.json()) as { requests: RecordedRequest[] };
  const requests = body.requests ?? [];
  return pathPrefix
    ? requests.filter((r) => r.path.startsWith(pathPrefix))
    : requests;
}

/** Pull `physical_count` / `physicalCount` off a change regardless of casing. */
function dataFor(
  obj: Record<string, unknown>,
  snake: string,
  camel: string
): Record<string, unknown> | undefined {
  return (obj[snake] ?? obj[camel]) as Record<string, unknown> | undefined;
}

/**
 * Collect every PHYSICAL_COUNT change (catalog_object_id + quantity) found in
 * the recorded `/v2/inventory/changes/batch-create` bodies. Tolerant of
 * snake_case vs camelCase — Square serializes quantity as a string.
 */
async function getPhysicalCounts(): Promise<
  { catalogObjectId: unknown; quantity: unknown }[]
> {
  const reqs = await getSquareRequests('/v2/inventory/changes/batch-create');
  const out: { catalogObjectId: unknown; quantity: unknown }[] = [];
  for (const req of reqs) {
    const body = req.body as Record<string, unknown>;
    const changes = (body['changes'] as Record<string, unknown>[]) ?? [];
    for (const change of changes) {
      const pc = dataFor(change, 'physical_count', 'physicalCount');
      if (pc) {
        out.push({
          catalogObjectId: pc['catalog_object_id'] ?? pc['catalogObjectId'],
          quantity: pc['quantity'],
        });
      }
    }
  }
  return out;
}

const CLASS_ID = 'prb-class-1';
const VARIATION_ID = 'prb-var-1';
const CAPACITY = 10;

/**
 * A published class that already carries FIXED Square IDs, so its
 * `squareVariationId` is deterministic and `syncClassToSquare` takes its
 * existing-mirror update path (which preserves the variation ID) rather than
 * creating a fresh catalog item.
 */
function syncedClassDoc(): Record<string, unknown> {
  return {
    ...PUBLISHED_CLASS,
    id: CLASS_ID,
    name: 'Inventory Weaving 201',
    capacity: CAPACITY,
    status: 'published',
    squareCatalogItemId: 'prb-item-1',
    squareVariationId: VARIATION_ID,
    squareModifierListId: 'prb-modlist-1',
    squareCatalogVersion: 1,
  };
}

/**
 * A registration that `countByClassId` will count (status confirmed, matching
 * classId, numeric quantity). Full doc — `setFirestoreDoc` PATCHes without an
 * updateMask, so it REPLACES the whole doc.
 */
function confirmedRegistrationDoc(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    id: 'prb-reg-1',
    classId: CLASS_ID,
    customerEmail: 'weaver@test.com',
    customerName: 'Test Weaver',
    quantity: 2,
    status: 'confirmed',
    source: 'web',
    pricePaidCents: 4770,
    subtotalCents: 4500,
    taxAmountCents: 270,
    taxRatePercent: 6.0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Seed the Square-synced class, let the class-write trigger's inventory
 * seeding settle, then reset the mock so only registration-triggered inventory
 * calls are observed thereafter.
 */
async function seedSyncedClassAndSettle(): Promise<void> {
  await setFirestoreDoc('classes', CLASS_ID, syncedClassDoc());
  await waitForTrigger(5000);
  await resetSquareMock();
}

describe('syncClassInventoryToSquare (emulator + Square mock)', () => {
  beforeEach(async () => {
    await clearFirestoreEmulator();
    await resetSquareMock();
  });

  it('sets Square inventory to (capacity - count) when a registration is created', async () => {
    await seedSyncedClassAndSettle();

    // Registration for 2 spots on a capacity-10 class → remaining 8.
    await setFirestoreDoc('registrations', 'prb-reg-1', confirmedRegistrationDoc());
    await waitForTrigger(5000);

    const counts = await getPhysicalCounts();
    if (process.env['DEBUG_SQUARE_MOCK']) {
      console.log('PHYSICAL_COUNTS', JSON.stringify(counts, null, 2));
    }

    // At least one PHYSICAL_COUNT for our variation set to 8.
    const forVariation = counts.filter(
      (c) => c.catalogObjectId === VARIATION_ID
    );
    expect(forVariation.length).toBeGreaterThanOrEqual(1);
    expect(forVariation.map((c) => String(c.quantity))).toContain('8');
  });

  it('issues NO inventory call for a non-count-relevant registration update', async () => {
    await seedSyncedClassAndSettle();

    // Seed one confirmed registration (fires the inventory sync once).
    await setFirestoreDoc('registrations', 'prb-reg-1', confirmedRegistrationDoc());
    await waitForTrigger(5000);

    // Discard that registration-create inventory call; only observe the update.
    await resetSquareMock();

    // Whole-doc replace: carry every field forward, change ONLY a non-count
    // field (squarePaymentId) — classId/status/quantity stay identical.
    await setFirestoreDoc(
      'registrations',
      'prb-reg-1',
      confirmedRegistrationDoc({ squarePaymentId: 'sq-pay-abc123' })
    );
    await waitForTrigger(5000);

    const counts = await getPhysicalCounts();
    expect(counts).toHaveLength(0);
  });

  it('recomputes inventory to full capacity when a registration is cancelled', async () => {
    await seedSyncedClassAndSettle();

    await setFirestoreDoc('registrations', 'prb-reg-1', confirmedRegistrationDoc());
    await waitForTrigger(5000);

    // Discard the create-time inventory call; only observe the cancellation.
    await resetSquareMock();

    // Flip confirmed → cancelled (count-relevant). cancelled is excluded from
    // countByClassId, so remaining returns to capacity (10).
    await setFirestoreDoc(
      'registrations',
      'prb-reg-1',
      confirmedRegistrationDoc({ status: 'cancelled' })
    );
    await waitForTrigger(5000);

    const counts = await getPhysicalCounts();
    const forVariation = counts.filter(
      (c) => c.catalogObjectId === VARIATION_ID
    );
    expect(forVariation.length).toBeGreaterThanOrEqual(1);
    expect(forVariation.map((c) => String(c.quantity))).toContain('10');
  });
});
