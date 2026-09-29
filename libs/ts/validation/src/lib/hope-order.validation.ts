/**
 * EMA order validation (WV Hope Scholarship). `staticSuite`, so pure.
 */
import { staticSuite, test, enforce, only } from 'vest';
import type { SaveHopeOrderInput } from '@maple/ts/domain';

export const hopeOrderValidation = staticSuite(
  (data: Partial<SaveHopeOrderInput>, field?: string | string[]) => {
    only(field);

    test('studentId', 'Student is required', () => {
      enforce(data.studentId ?? '').isNotBlank();
    });

    test('productId', 'Choose the EMA product ordered', () => {
      enforce(data.productId ?? '').isNotBlank();
    });

    test('lessonCount', 'Number of lessons must be a whole number, at least 1', () => {
      enforce(data.lessonCount).isNumber().greaterThanOrEquals(1);
      enforce(Number.isInteger(data.lessonCount)).isTruthy();
    });

    test('orderedOn', 'Order date is required', () => {
      const date = data.orderedOn ? new Date(data.orderedOn) : undefined;
      enforce(Boolean(date && !Number.isNaN(date.getTime()))).isTruthy();
    });
  }
);
