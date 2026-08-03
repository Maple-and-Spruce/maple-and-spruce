/**
 * Discounts domain — route handlers.
 *
 * Pure handler functions, deliberately separated from the router wiring in
 * `discounts-api.ts`. Handlers take (data, context) exactly as they did when
 * each was its own Cloud Function, so they are unit-testable without the
 * onRequest/CORS/auth machinery — and so the move to a router (ADR-029) is a
 * wiring change rather than a rewrite.
 *
 * Behaviour here must stay byte-for-byte identical to the standalone
 * functions these replace (getDiscounts, createDiscount, updateDiscount,
 * deleteDiscount, lookupDiscount). Any change in error text or shape is a
 * client-visible regression.
 */
import {
  throwInvalidArgument,
  throwNotFound,
  throwValidationError,
} from '@maple/firebase/functions';
import { DiscountRepository } from '@maple/firebase/database';
import { discountValidation } from '@maple/ts/validation';
import { isDiscountValid } from '@maple/ts/domain';
import type {
  CreateDiscountRequest,
  CreateDiscountResponse,
  DeleteDiscountRequest,
  DeleteDiscountResponse,
  GetDiscountsRequest,
  GetDiscountsResponse,
  LookupDiscountRequest,
  LookupDiscountResponse,
  UpdateDiscountRequest,
  UpdateDiscountResponse,
} from '@maple/ts/firebase/api-types';

/** Admin. Lists discounts with an optional status filter. */
export async function getDiscountsHandler(
  data: GetDiscountsRequest,
): Promise<GetDiscountsResponse> {
  const discounts = await DiscountRepository.findAll({
    status: data.status,
  });

  return { discounts };
}

/** Admin. Creates a discount code, enforcing code uniqueness. */
export async function createDiscountHandler(
  data: CreateDiscountRequest,
): Promise<CreateDiscountResponse> {
  const result = discountValidation(data);
  if (!result.isValid()) {
    const errors = result.getErrors();
    const errorMessages = Object.entries(errors)
      .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
      .join('; ');
    throw new Error(`Validation failed: ${errorMessages}`);
  }

  const existing = await DiscountRepository.findByCode(data.code);
  if (existing) {
    throw new Error(`Discount code "${data.code.toUpperCase()}" already exists`);
  }

  const discount = await DiscountRepository.create(data);

  return { discount };
}

/** Admin. Partial update; validates only the changed fields. */
export async function updateDiscountHandler(
  data: UpdateDiscountRequest,
): Promise<UpdateDiscountResponse> {
  if (!data.id) {
    throwInvalidArgument('Discount ID is required');
  }

  const existing = await DiscountRepository.findById(data.id);
  if (!existing) {
    throwNotFound('Discount', data.id);
  }

  const fields = Object.keys(data).filter((key) => key !== 'id');
  if (fields.length > 0) {
    const result = discountValidation({ ...existing, ...data }, fields);
    if (result.hasErrors()) {
      throwValidationError(result.getErrors());
    }
  }

  if (data.code && data.code.toUpperCase() !== existing.code) {
    const codeExists = await DiscountRepository.findByCode(data.code);
    if (codeExists) {
      throw new Error(
        `Discount code "${data.code.toUpperCase()}" already exists`,
      );
    }
  }

  const discount = await DiscountRepository.update(data);

  return { discount };
}

/** Admin. Deletes a discount by id. */
export async function deleteDiscountHandler(
  data: DeleteDiscountRequest,
): Promise<DeleteDiscountResponse> {
  if (!data.id) {
    throw new Error('Discount ID is required');
  }

  const existing = await DiscountRepository.findById(data.id);
  if (!existing) {
    throw new Error(`Discount not found: ${data.id}`);
  }

  await DiscountRepository.delete(data.id);

  return { success: true };
}

/**
 * PUBLIC — no auth. Used by the checkout form to resolve a code.
 *
 * Returns `{ discount: undefined }` rather than throwing for a missing or
 * invalid code: the checkout UI treats "not found" as a normal outcome, and
 * an error envelope would surface as a failure to the customer.
 */
export async function lookupDiscountHandler(
  data: LookupDiscountRequest,
): Promise<LookupDiscountResponse> {
  if (!data.code || typeof data.code !== 'string') {
    return { discount: undefined };
  }

  const discount = await DiscountRepository.findByCode(data.code);

  if (!discount || !isDiscountValid(discount)) {
    return { discount: undefined };
  }

  return { discount };
}
