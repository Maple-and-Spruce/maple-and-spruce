/**
 * Editing a shop product's name, description or price through
 * `productCatalog/updateProduct`.
 *
 * Square moves an item's version without us writing to it. On dev, a product
 * created through `productCatalog/createProduct` had a newer version in Square
 * than on its Firestore record by its first edit, and every name or
 * description edit then failed with "Catalog version mismatch: expected X,
 * got Y" while quantity edits (which never touch the catalog) went through.
 *
 * The Square mock keeps its catalog the way Square does: GET serves back what
 * was written, every write bumps the version, a write on the wrong version is
 * refused, and an item upsert replaces the variation list. `/_mock/catalog/
 * :id/touch` moves an item's version the way Square does on its own.
 */
import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  getFirestoreDoc,
  callFunction,
  EMULATOR_CONFIG,
  ADMIN_USER,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';
import type {
  CreateProductRequest,
  CreateProductResponse,
  UpdateProductRequest,
  UpdateProductResponse,
} from '@maple/ts/firebase/api-types';

// From the shared config, which applies EMULATOR_PORT_OFFSET in a worktree.
const SQUARE_MOCK = EMULATOR_CONFIG.squareMockServerUrl;

interface WireVariation {
  id: string;
  version: number;
  item_variation_data: {
    name: string;
    price_money: { amount: number };
  };
}
interface WireItem {
  id: string;
  version: number;
  item_data: {
    name: string;
    description?: string;
    variations: WireVariation[];
  };
}

async function squareItem(id: string): Promise<WireItem> {
  const res = await fetch(`${SQUARE_MOCK}/_mock/catalog/${id}`);
  expect(res.status).toBe(200);
  return ((await res.json()) as { object: WireItem }).object;
}

/** Move the item's version in Square without changing anything we track. */
async function squareMovesVersion(id: string): Promise<number> {
  const res = await fetch(`${SQUARE_MOCK}/_mock/catalog/${id}/touch`, {
    method: 'POST',
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { object: WireItem }).object.version;
}

describe('Editing a shop product after Square has moved its version', () => {
  let adminUser: TestUser;

  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();

    adminUser = await createTestUser(ADMIN_USER.email, ADMIN_USER.password);
    await setFirestoreDoc('admins', adminUser.uid, {
      userId: adminUser.uid,
      email: adminUser.email,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }, 30000);

  beforeEach(async () => {
    await fetch(`${SQUARE_MOCK}/_mock/reset`, { method: 'POST' });
  });

  const createProduct = (data: CreateProductRequest) =>
    callFunction<CreateProductRequest, CreateProductResponse>({
      functionName: 'productCatalog/createProduct',
      data,
      idToken: adminUser.idToken,
    });

  const updateProduct = (data: UpdateProductRequest) =>
    callFunction<UpdateProductRequest, UpdateProductResponse>({
      functionName: 'productCatalog/updateProduct',
      data,
      idToken: adminUser.idToken,
    });

  it('renames the product in Square and catches the record up to Square’s version', async () => {
    const created = await createProduct({
      artistId: 'artist-int-1',
      status: 'active',
      name: 'Speckled Stoneware Mug',
      description: 'Holds 12 oz.',
      priceCents: 3200,
      quantity: 4,
    });
    expect(created.status).toBe(200);
    const product = created.data!.product;
    const itemId = product.squareItemId;

    const movedTo = await squareMovesVersion(itemId);
    expect(movedTo).toBeGreaterThan(product.squareCatalogVersion!);

    const result = await updateProduct({
      id: product.id,
      name: 'Speckled Stoneware Mug (Large)',
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(200);

    const inSquare = await squareItem(itemId);
    expect(inSquare.item_data.name).toBe('Speckled Stoneware Mug (Large)');
    expect(inSquare.item_data.description).toBe('Holds 12 oz.');
    // A name-only edit must not drop the variation: Square deletes one left
    // out of an item upsert.
    expect(inSquare.item_data.variations).toHaveLength(1);
    expect(inSquare.item_data.variations[0].id).toBe(
      product.variants[0].squareVariationId,
    );
    expect(
      Number(inSquare.item_data.variations[0].item_variation_data.price_money.amount),
    ).toBe(3200);

    const stored = await getFirestoreDoc('products', product.id);
    expect(
      (stored!['squareCache'] as { name: string }).name,
    ).toBe('Speckled Stoneware Mug (Large)');
    expect(stored!['squareCatalogVersion']).toBe(inSquare.version);

    // And the next edit works off the record without another nudge.
    const again = await updateProduct({
      id: product.id,
      description: 'Holds 16 oz.',
    });
    expect(again.status).toBe(200);
    expect((await squareItem(itemId)).item_data.description).toBe('Holds 16 oz.');
  });

  it('repricing one variant leaves the other variant in Square', async () => {
    const created = await createProduct({
      artistId: 'artist-int-1',
      status: 'active',
      name: 'Hand-dyed Scarf',
      variants: [
        { label: 'Short', priceCents: 2400, quantity: 2 },
        { label: 'Long', priceCents: 3600, quantity: 1 },
      ],
      variantProperties: ['Length'],
    });
    expect(created.status).toBe(200);
    const product = created.data!.product;

    await squareMovesVersion(product.squareItemId);

    const result = await updateProduct({
      id: product.id,
      variants: [{ label: 'Long', priceCents: 3900, quantity: 1 }],
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(200);

    const variations = (await squareItem(product.squareItemId)).item_data
      .variations;
    const byName = Object.fromEntries(
      variations.map((v) => [
        v.item_variation_data.name,
        Number(v.item_variation_data.price_money.amount),
      ]),
    );
    expect(byName).toEqual({ Short: 2400, Long: 3900 });
  });
});
