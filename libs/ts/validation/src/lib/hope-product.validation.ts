/**
 * EMA product validation (WV Hope Scholarship).
 *
 * Declared with `staticSuite` so it is pure and safe in warm function
 * containers. A product is a price the studio bills a state program at, so it
 * must be a real, positive, whole-cent amount and carry the portal's id.
 */
import { staticSuite, test, enforce, only } from 'vest';
import type { SaveHopeProductInput } from '@maple/ts/domain';

export const hopeProductValidation = staticSuite(
  (data: Partial<SaveHopeProductInput>, field?: string | string[]) => {
    only(field);

    test('emaProductId', 'EMA product ID is required', () => {
      enforce(data.emaProductId ?? '').isNotBlank();
    });

    test('name', 'Name is required', () => {
      enforce(data.name ?? '').isNotBlank();
    });

    test('priceCents', 'Price must be more than $0', () => {
      enforce(data.priceCents).isNumber().greaterThan(0);
    });

    test('priceCents', 'Price must be whole cents', () => {
      enforce(Number.isInteger(data.priceCents)).isTruthy();
    });
  }
);
