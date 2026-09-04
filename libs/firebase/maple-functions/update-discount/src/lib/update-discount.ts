/**
 * Update Discount Cloud Function
 *
 * Updates an existing discount code.
 * Admin-only endpoint.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import {
  Functions,
  Role,
  assertCanManageDiscountProgram,
  throwInvalidArgument,
  throwNotFound,
  throwValidationError,
} from '@maple/firebase/functions';
import { DiscountRepository } from '@maple/firebase/database';
import { discountValidation } from '@maple/ts/validation';
import type {
  UpdateDiscountRequest,
  UpdateDiscountResponse,
} from '@maple/ts/firebase/api-types';

export const updateDiscount = Functions.endpoint
  .requiringRole([Role.Admin, Role.MtTeacher])
  .handle<
    UpdateDiscountRequest,
    UpdateDiscountResponse
  >(async (data, context) => {
    if (!data.id) {
      throwInvalidArgument('Discount ID is required');
    }

    const existing = await DiscountRepository.findById(data.id);
    if (!existing) {
      throwNotFound('Discount', data.id);
    }

    // Authorize on the STORED program — the one whose money is at stake. There
    // is no `program` on the update input at all: `program` is immutable, so a
    // code can never be moved between businesses after customers hold it.
    await assertCanManageDiscountProgram(context, existing.program);

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
  });
