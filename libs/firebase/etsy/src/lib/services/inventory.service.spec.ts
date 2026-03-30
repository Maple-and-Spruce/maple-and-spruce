import { describe, it, expect } from 'vitest';
import type { EtsyListingInventory } from '../types/listing.types';
import { InventoryService } from './inventory.service';

/**
 * Test the critical stripServerFields logic — this is the most
 * error-prone part of the Etsy inventory API integration.
 */
describe('InventoryService', () => {
  describe('stripServerFields', () => {
    function createService(): InventoryService {
      // We only test stripServerFields which doesn't need http
      return new InventoryService(null as never);
    }

    it('strips product_id, offering_id, is_deleted from products and offerings', () => {
      const inventory: EtsyListingInventory = {
        products: [
          {
            product_id: 100,
            sku: 'TEST-SKU',
            is_deleted: false,
            offerings: [
              {
                offering_id: 200,
                quantity: 5,
                is_enabled: true,
                is_deleted: false,
                price: { amount: 2500, divisor: 100, currency_code: 'USD' },
              },
            ],
            property_values: [],
          },
        ],
        price_on_property: [],
        quantity_on_property: [],
        sku_on_property: [],
      };

      const service = createService();
      const result = service.stripServerFields(inventory);

      // product_id should not be present
      expect(result.products[0]).not.toHaveProperty('product_id');
      expect(result.products[0]).not.toHaveProperty('is_deleted');

      // offering_id should not be present
      expect(result.products[0].offerings[0]).not.toHaveProperty(
        'offering_id'
      );
      expect(result.products[0].offerings[0]).not.toHaveProperty('is_deleted');
    });

    it('converts price from {amount, divisor} to decimal float', () => {
      const inventory: EtsyListingInventory = {
        products: [
          {
            product_id: 1,
            sku: 'SKU',
            is_deleted: false,
            offerings: [
              {
                offering_id: 2,
                quantity: 1,
                is_enabled: true,
                is_deleted: false,
                price: { amount: 2500, divisor: 100, currency_code: 'USD' },
              },
            ],
            property_values: [],
          },
        ],
        price_on_property: [],
        quantity_on_property: [],
        sku_on_property: [],
      };

      const service = createService();
      const result = service.stripServerFields(inventory);

      expect(result.products[0].offerings[0].price).toBe(25.0);
    });

    it('filters out deleted products', () => {
      const inventory: EtsyListingInventory = {
        products: [
          {
            product_id: 1,
            sku: 'ACTIVE',
            is_deleted: false,
            offerings: [
              {
                offering_id: 1,
                quantity: 5,
                is_enabled: true,
                is_deleted: false,
                price: { amount: 1000, divisor: 100, currency_code: 'USD' },
              },
            ],
            property_values: [],
          },
          {
            product_id: 2,
            sku: 'DELETED',
            is_deleted: true,
            offerings: [],
            property_values: [],
          },
        ],
        price_on_property: [],
        quantity_on_property: [],
        sku_on_property: [],
      };

      const service = createService();
      const result = service.stripServerFields(inventory);

      expect(result.products).toHaveLength(1);
      expect(result.products[0].sku).toBe('ACTIVE');
    });

    it('filters out deleted offerings', () => {
      const inventory: EtsyListingInventory = {
        products: [
          {
            product_id: 1,
            sku: 'SKU',
            is_deleted: false,
            offerings: [
              {
                offering_id: 1,
                quantity: 5,
                is_enabled: true,
                is_deleted: false,
                price: { amount: 1000, divisor: 100, currency_code: 'USD' },
              },
              {
                offering_id: 2,
                quantity: 0,
                is_enabled: false,
                is_deleted: true,
                price: { amount: 500, divisor: 100, currency_code: 'USD' },
              },
            ],
            property_values: [],
          },
        ],
        price_on_property: [],
        quantity_on_property: [],
        sku_on_property: [],
      };

      const service = createService();
      const result = service.stripServerFields(inventory);

      expect(result.products[0].offerings).toHaveLength(1);
      expect(result.products[0].offerings[0].quantity).toBe(5);
    });

    it('strips scale_name from property_values', () => {
      const inventory: EtsyListingInventory = {
        products: [
          {
            product_id: 1,
            sku: 'SKU',
            is_deleted: false,
            offerings: [
              {
                offering_id: 1,
                quantity: 1,
                is_enabled: true,
                is_deleted: false,
                price: { amount: 1000, divisor: 100, currency_code: 'USD' },
              },
            ],
            property_values: [
              {
                property_id: 200,
                property_name: 'Color',
                scale_id: null,
                scale_name: null,
                value_ids: [1],
                values: ['Blue'],
              },
            ],
          },
        ],
        price_on_property: [200],
        quantity_on_property: [],
        sku_on_property: [],
      };

      const service = createService();
      const result = service.stripServerFields(inventory);

      const pv = result.products[0].property_values![0];
      expect(pv).not.toHaveProperty('scale_id');
      expect(pv).not.toHaveProperty('scale_name');
      expect(pv.property_id).toBe(200);
      expect(pv.property_name).toBe('Color');
      expect(pv.values).toEqual(['Blue']);
    });

    it('preserves price_on_property, quantity_on_property, sku_on_property', () => {
      const inventory: EtsyListingInventory = {
        products: [
          {
            product_id: 1,
            sku: 'SKU',
            is_deleted: false,
            offerings: [
              {
                offering_id: 1,
                quantity: 1,
                is_enabled: true,
                is_deleted: false,
                price: { amount: 1000, divisor: 100, currency_code: 'USD' },
              },
            ],
            property_values: [],
          },
        ],
        price_on_property: [200],
        quantity_on_property: [201],
        sku_on_property: [202],
      };

      const service = createService();
      const result = service.stripServerFields(inventory);

      expect(result.price_on_property).toEqual([200]);
      expect(result.quantity_on_property).toEqual([201]);
      expect(result.sku_on_property).toEqual([202]);
    });
  });
});
