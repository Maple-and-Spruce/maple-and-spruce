// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  routes: {} as Record<string, ReturnType<typeof vi.fn>>,
  callDeduped: vi.fn(),
}));

vi.mock('firebase/functions', () => ({
  httpsCallableFromURL: (_functions: unknown, url: string) => mocks.routes[url],
}));
vi.mock('@maple/ts/firebase/firebase-config', () => ({
  getMapleFunctions: () => ({}),
  routerCallableUrl: (router: string, name: string) => `${router}/${name}`,
}));
vi.mock('./call-deduped', () => ({ callDeduped: mocks.callDeduped }));

import { useProducts } from './useProducts';

const existing = { id: 'prod-1', squareCache: { name: 'Walnut bowl' } };
const created = { id: 'prod-2', squareCache: { name: 'Maple spoon' } };
const renamed = { ...existing, squareCache: { name: 'Cherry bowl' } };

describe('useProducts', () => {
  beforeEach(() => {
    mocks.callDeduped.mockReset().mockResolvedValue({ data: { products: [existing] } });
    mocks.routes = {
      'productCatalog/createProduct': vi.fn().mockResolvedValue({ data: { product: created } }),
      'productCatalog/updateProduct': vi.fn().mockResolvedValue({ data: { product: renamed } }),
      'products/deleteProduct': vi.fn().mockResolvedValue({ data: { success: true } }),
    };
  });

  it('loads products from the products router', async () => {
    const { result } = renderHook(() => useProducts());

    await waitFor(() => expect(result.current.productsState.status).toBe('success'));
    expect(mocks.callDeduped).toHaveBeenCalledWith({ router: 'products', route: 'getProducts' }, {});
  });

  it('creates through the productCatalog router and puts the new product first', async () => {
    const { result } = renderHook(() => useProducts());
    await waitFor(() => expect(result.current.productsState.status).toBe('success'));

    const input = { name: 'Maple spoon', priceCents: 2400, quantity: 3 } as never;
    await act(async () => {
      await result.current.createProduct(input);
    });

    expect(mocks.routes['productCatalog/createProduct']).toHaveBeenCalledWith(input);
    const state = result.current.productsState;
    if (state.status !== 'success') throw new Error('expected success');
    expect(state.data.map((p) => p.id)).toEqual(['prod-2', 'prod-1']);
  });

  it('updates through the productCatalog router and replaces the product in place', async () => {
    const { result } = renderHook(() => useProducts());
    await waitFor(() => expect(result.current.productsState.status).toBe('success'));

    await act(async () => {
      await result.current.updateProduct({ id: 'prod-1', name: 'Cherry bowl' } as never);
    });

    expect(mocks.routes['productCatalog/updateProduct']).toHaveBeenCalledWith({
      id: 'prod-1',
      name: 'Cherry bowl',
    });
    const state = result.current.productsState;
    if (state.status !== 'success') throw new Error('expected success');
    expect(state.data).toEqual([renamed]);
  });

  it('deletes through the products router and drops the product', async () => {
    const { result } = renderHook(() => useProducts());
    await waitFor(() => expect(result.current.productsState.status).toBe('success'));

    await act(async () => {
      await result.current.deleteProduct('prod-1');
    });

    expect(mocks.routes['products/deleteProduct']).toHaveBeenCalledWith({ id: 'prod-1' });
    const state = result.current.productsState;
    if (state.status !== 'success') throw new Error('expected success');
    expect(state.data).toEqual([]);
  });
});
