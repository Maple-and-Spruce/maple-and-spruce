/**
 * Record Sale Cloud Function
 *
 * Admin-only callable function for manually recording a product sale.
 * Automatically:
 * 1. Looks up product and artist for commission calculation
 * 2. Creates a Sale record with commission split
 * 3. Creates an InventoryMovement audit log entry
 * 4. Decrements variant quantity on the product
 */
import {
  createAdminFunction,
  throwInvalidArgument,
  throwNotFound,
} from '@maple/firebase/functions';
import {
  ProductRepository,
  ArtistRepository,
  SaleRepository,
  InventoryMovementRepository,
} from '@maple/firebase/database';
import {
  calculateSaleAmounts,
  getEffectiveCommissionRate,
  findVariant,
  validateInventoryMovement,
} from '@maple/ts/domain';
import type {
  RecordProductSaleRequest,
  RecordProductSaleResponse,
} from '@maple/ts/firebase/api-types';

export const recordSale = createAdminFunction<
  RecordProductSaleRequest,
  RecordProductSaleResponse
>(async (data) => {
  if (!data.productId) {
    throwInvalidArgument('Product ID is required');
  }

  const quantitySold = data.quantitySold ?? 1;
  if (quantitySold < 1) {
    throwInvalidArgument('Quantity sold must be at least 1');
  }

  // 1. Fetch product
  const product = await ProductRepository.findById(data.productId);
  if (!product) {
    throwNotFound('Product', data.productId);
  }

  // Determine which variant
  let variantId = data.variantId;
  if (!variantId && product.variants.length === 1) {
    variantId = product.variants[0].id;
  }
  if (!variantId) {
    throwInvalidArgument(
      'variantId is required for multi-variant products'
    );
  }

  const variant = findVariant(product, variantId);
  if (!variant) {
    throwNotFound('ProductVariant', variantId);
  }

  // 2. Fetch artist for commission rate
  const artist = await ArtistRepository.findById(product.artistId);
  if (!artist) {
    throwNotFound('Artist', product.artistId);
  }

  // 3. Calculate commission
  const commissionRate = getEffectiveCommissionRate(
    product,
    artist.defaultCommissionRate
  );
  const salePriceCents = data.salePriceCents ?? variant.priceCents;
  const salePrice = (salePriceCents * quantitySold) / 100;
  const { commission, artistEarnings } = calculateSaleAmounts(
    salePrice,
    commissionRate
  );

  // 4. Validate inventory
  const inventoryCheck = validateInventoryMovement(
    variant.quantity,
    -quantitySold
  );
  if (!inventoryCheck.valid) {
    throwInvalidArgument(inventoryCheck.error ?? 'Insufficient inventory');
  }

  // 5. Create sale record
  const soldAt = data.soldAt ? new Date(data.soldAt) : new Date();
  const sale = await SaleRepository.create({
    productId: data.productId,
    variantId,
    artistId: product.artistId,
    salePrice,
    quantitySold,
    commission,
    artistEarnings,
    commissionRateApplied: commissionRate,
    source: data.source ?? 'manual',
    etsyOrderId: data.etsyOrderId,
    etsyReceiptId: data.etsyReceiptId,
    soldAt,
  });

  // 6. Create inventory movement
  await InventoryMovementRepository.create({
    productId: data.productId,
    variantId,
    type: 'sale',
    quantityChange: -quantitySold,
    quantityBefore: variant.quantity,
    quantityAfter: variant.quantity - quantitySold,
    source: 'manual',
    saleId: sale.id,
    performedBy: 'admin',
  });

  // 7. Decrement variant quantity
  await ProductRepository.updateVariantQuantity(
    data.productId,
    variantId,
    variant.quantity - quantitySold
  );

  return { sale };
});
