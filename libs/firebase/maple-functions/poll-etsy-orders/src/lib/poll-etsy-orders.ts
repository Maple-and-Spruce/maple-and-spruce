/**
 * Poll Etsy Orders Cloud Function
 *
 * Polls the Etsy Receipts API for new orders since the last poll cursor.
 * For each paid/completed receipt, creates Sale records, InventoryMovements,
 * and decrements product variant quantities.
 *
 * Admin callable. Input: { forceFullSync?: boolean }
 * Lives in the maple-sync codebase (Etsy API dependency).
 */
import { Functions, Role } from '@maple/firebase/functions';
import {
  FirestoreTokenStorage,
  ProductRepository,
  ArtistRepository,
  SaleRepository,
  InventoryMovementRepository,
} from '@maple/firebase/database';
import { EtsyClient } from '@maple/firebase/etsy';
import type { EtsyReceipt, EtsyTransaction } from '@maple/firebase/etsy';
import {
  calculateSaleAmounts,
  getEffectiveCommissionRate,
  findVariantByEtsyProductId,
} from '@maple/ts/domain';
import { db } from '@maple/firebase/database';

const ETSY_SECRET_NAMES = ['ETSY_API_KEY', 'ETSY_SHARED_SECRET'] as const;
const ETSY_STRING_NAMES = ['ETSY_REDIRECT_URI'] as const;

const POLL_CURSOR_DOC = '_config/etsy-poll-cursor';

interface PollEtsyOrdersRequest {
  forceFullSync?: boolean;
}

interface PollEtsyOrdersResponse {
  processed: number;
  skipped: number;
  errors: string[];
}

/**
 * Read the last poll timestamp from Firestore.
 * Returns 0 if no cursor exists (full sync).
 */
async function getLastPollTimestamp(): Promise<number> {
  const doc = await db.doc(POLL_CURSOR_DOC).get();
  if (!doc.exists) {
    return 0;
  }
  return (doc.data()?.lastPollTimestamp as number) ?? 0;
}

/**
 * Update the poll cursor with the latest receipt timestamp.
 */
async function updatePollCursor(timestamp: number): Promise<void> {
  await db.doc(POLL_CURSOR_DOC).set(
    { lastPollTimestamp: timestamp, updatedAt: new Date() },
    { merge: true }
  );
}

/**
 * Process a single Etsy transaction within a receipt.
 * Returns 'processed' | 'skipped' or throws on error.
 */
async function processTransaction(
  receipt: EtsyReceipt,
  transaction: EtsyTransaction
): Promise<'processed' | 'skipped'> {
  const dedupeKey = `${receipt.receipt_id}-${transaction.transaction_id}`;

  // Check for duplicate
  const existing = await SaleRepository.findByEtsyReceiptId(dedupeKey);
  if (existing) {
    return 'skipped';
  }

  // Look up product by Etsy listing ID
  const product = await ProductRepository.findByEtsyListingId(
    String(transaction.listing_id)
  );
  if (!product) {
    throw new Error(
      `No product found for Etsy listing ${transaction.listing_id}`
    );
  }

  // Find the variant by etsyProductId
  let variant = findVariantByEtsyProductId(product, transaction.product_id);

  // Fallback to first variant if single-variant product
  if (!variant && product.variants.length === 1) {
    variant = product.variants[0];
  }
  if (!variant) {
    throw new Error(
      `No variant found for Etsy product ${transaction.product_id} on product ${product.id}`
    );
  }

  // Fetch artist for commission calculation
  const artist = await ArtistRepository.findById(product.artistId);
  if (!artist) {
    throw new Error(`Artist ${product.artistId} not found for product ${product.id}`);
  }

  // Calculate sale amounts
  const commissionRate = getEffectiveCommissionRate(
    product,
    artist.defaultCommissionRate
  );
  const salePriceCents = transaction.price.amount;
  const salePrice = (salePriceCents * transaction.quantity) /
    (transaction.price.divisor || 100);
  const { commission, artistEarnings } = calculateSaleAmounts(
    salePrice,
    commissionRate
  );

  // Create sale record
  const sale = await SaleRepository.create({
    productId: product.id,
    variantId: variant.id,
    artistId: product.artistId,
    salePrice,
    quantitySold: transaction.quantity,
    commission,
    artistEarnings,
    commissionRateApplied: commissionRate,
    source: 'etsy',
    etsyOrderId: String(receipt.order_id),
    etsyReceiptId: dedupeKey,
    soldAt: new Date(receipt.create_timestamp * 1000),
  });

  // Create inventory movement
  await InventoryMovementRepository.create({
    productId: product.id,
    variantId: variant.id,
    type: 'sale',
    quantityChange: -transaction.quantity,
    quantityBefore: variant.quantity,
    quantityAfter: variant.quantity - transaction.quantity,
    source: 'etsy',
    saleId: sale.id,
    performedBy: 'system',
  });

  // Decrement variant quantity
  await ProductRepository.updateVariantQuantity(
    product.id,
    variant.id,
    variant.quantity - transaction.quantity
  );

  return 'processed';
}

export const pollEtsyOrders = Functions.endpoint
  .usingSecrets(...ETSY_SECRET_NAMES)
  .usingStrings(...ETSY_STRING_NAMES)
  .requiringRole(Role.Admin)
  .handle<PollEtsyOrdersRequest, PollEtsyOrdersResponse>(
    async (data, _context, secrets, strings) => {
      let processed = 0;
      let skipped = 0;
      const errors: string[] = [];

      // 1. Read last poll cursor
      const lastPollTimestamp = data.forceFullSync
        ? 0
        : await getLastPollTimestamp();

      // 2. Create Etsy client and get shop ID
      const client = new EtsyClient({
        apiKey: secrets.ETSY_API_KEY,
        sharedSecret: secrets.ETSY_SHARED_SECRET,
        tokenStorage: FirestoreTokenStorage,
        redirectUri: strings.ETSY_REDIRECT_URI,
      });

      const tokens = await FirestoreTokenStorage.getTokens();
      if (!tokens?.shopId) {
        return { processed: 0, skipped: 0, errors: ['No Etsy shop ID configured'] };
      }

      const shopId = Number(tokens.shopId);

      // 3. Fetch receipts since last poll
      const receipts = await client.receipts.getShopReceipts(shopId, {
        minCreated: lastPollTimestamp > 0 ? lastPollTimestamp : undefined,
        limit: 100,
      });

      // 4. Process each receipt
      let latestTimestamp = lastPollTimestamp;

      for (const receipt of receipts) {
        // Only process paid/completed receipts
        const status = receipt.status.toLowerCase();
        if (!status.includes('paid') && !status.includes('completed')) {
          continue;
        }

        for (const transaction of receipt.transactions) {
          try {
            const result = await processTransaction(receipt, transaction);
            if (result === 'processed') {
              processed++;
            } else {
              skipped++;
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            errors.push(
              `Receipt ${receipt.receipt_id}, tx ${transaction.transaction_id}: ${message}`
            );
          }
        }

        // Track latest timestamp for cursor update
        if (receipt.create_timestamp > latestTimestamp) {
          latestTimestamp = receipt.create_timestamp;
        }
      }

      // 5. Update poll cursor
      if (latestTimestamp > lastPollTimestamp) {
        await updatePollCursor(latestTimestamp);
      }

      return { processed, skipped, errors };
    }
  );
