/**
 * Delete Discount Cloud Function
 *
 * Deletes an existing discount code.
 *
 * Gated `[Admin, MtTeacher]`, then narrowed by
 * `assertCanManageDiscountProgram` on the STORED program: an mt-teacher can
 * delete Music Together codes and nothing else.
 *
 * Deployed to us-east4 via CI/CD pipeline.
 */
import {
  Functions,
  Role,
  assertCanManageDiscountProgram,
  throwInvalidArgument,
  throwNotFound,
} from '@maple/firebase/functions';
import { DiscountRepository } from '@maple/firebase/database';
import type {
  DeleteDiscountRequest,
  DeleteDiscountResponse,
} from '@maple/ts/firebase/api-types';

export const deleteDiscount = Functions.endpoint
  .requiringRole([Role.Admin, Role.MtTeacher])
  .handle<DeleteDiscountRequest, DeleteDiscountResponse>(
    async (data, context) => {
      if (!data.id) {
        throwInvalidArgument('Discount ID is required');
      }

      const existing = await DiscountRepository.findById(data.id);
      if (!existing) {
        throwNotFound('Discount', data.id);
      }

      await assertCanManageDiscountProgram(context, existing.program);

      await DiscountRepository.delete(data.id);

      return { success: true };
    }
  );
