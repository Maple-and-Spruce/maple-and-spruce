/**
 * InventoryMovement Repository
 *
 * Immutable audit log of all inventory changes.
 * Supports reconciliation by summing all movements for a product.
 */
import { db, toDate } from './utilities/database.config';
import type {
  InventoryMovement,
  CreateInventoryMovementInput,
  InventoryMovementType,
  InventorySource,
} from '@maple/ts/domain';
import { calculateQuantityFromMovements } from '@maple/ts/domain';

const COLLECTION = 'inventoryMovements';

function docToMovement(
  doc: FirebaseFirestore.DocumentSnapshot
): InventoryMovement | undefined {
  if (!doc.exists) {
    return undefined;
  }

  const data = doc.data()!;

  return {
    id: doc.id,
    productId: data.productId,
    variantId: data.variantId,
    type: data.type,
    quantityChange: data.quantityChange,
    quantityBefore: data.quantityBefore,
    quantityAfter: data.quantityAfter,
    source: data.source,
    sourceReference: data.sourceReference,
    saleId: data.saleId,
    notes: data.notes,
    performedBy: data.performedBy,
    createdAt: toDate(data.createdAt),
  };
}

export interface InventoryMovementFilters {
  productId?: string;
  type?: InventoryMovementType;
  source?: InventorySource;
}

export const InventoryMovementRepository = {
  async create(
    input: CreateInventoryMovementInput
  ): Promise<InventoryMovement> {
    const docRef = db.collection(COLLECTION).doc();
    const now = new Date();

    const data = {
      productId: input.productId,
      variantId: input.variantId,
      type: input.type,
      quantityChange: input.quantityChange,
      quantityBefore: input.quantityBefore,
      quantityAfter: input.quantityAfter,
      source: input.source,
      sourceReference: input.sourceReference,
      saleId: input.saleId,
      notes: input.notes,
      performedBy: input.performedBy,
      createdAt: now,
    };

    await docRef.set(data);

    return {
      id: docRef.id,
      ...data,
      createdAt: now,
    };
  },

  async findByProductId(productId: string): Promise<InventoryMovement[]> {
    const snapshot = await db
      .collection(COLLECTION)
      .where('productId', '==', productId)
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs
      .map((doc) => docToMovement(doc))
      .filter((m): m is InventoryMovement => m !== undefined);
  },

  async findAll(
    filters: InventoryMovementFilters = {}
  ): Promise<InventoryMovement[]> {
    let query: FirebaseFirestore.Query = db.collection(COLLECTION);

    if (filters.productId) {
      query = query.where('productId', '==', filters.productId);
    }
    if (filters.type) {
      query = query.where('type', '==', filters.type);
    }
    if (filters.source) {
      query = query.where('source', '==', filters.source);
    }

    query = query.orderBy('createdAt', 'desc');

    const snapshot = await query.get();
    return snapshot.docs
      .map((doc) => docToMovement(doc))
      .filter((m): m is InventoryMovement => m !== undefined);
  },

  async reconcile(
    productId: string
  ): Promise<{
    calculatedQuantity: number;
    movements: InventoryMovement[];
  }> {
    const movements = await this.findByProductId(productId);
    const calculatedQuantity = calculateQuantityFromMovements(movements);

    return { calculatedQuantity, movements };
  },
};
