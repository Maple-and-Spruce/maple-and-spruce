/**
 * Create Discount Cloud Function
 *
 * Creates a new discount code, validated and unique by code.
 *
 * Gated `[Admin, MtTeacher]` so Stephanie can run her own Music Together
 * promotions. `assertCanManageDiscountProgram` is the second half of that
 * gate: a non-admin may only create `music-together` codes, never Maple &
 * Spruce class codes — those bill to a different business.
 *
 * Codes are globally unique across programs. That is deliberate: a customer
 * types a code without knowing which program owns it, so one string must mean
 * one thing everywhere. Reusing a classes code for Music Together is rejected
 * here rather than resolved by context.
 *
 * Deployed to us-east4 via CI/CD pipeline.
 */
import {
  Functions,
  Role,
  assertCanManageDiscountProgram,
  throwFailedPrecondition,
} from '@maple/firebase/functions';
import { DiscountRepository } from '@maple/firebase/database';
import { discountProgramLabel } from '@maple/ts/domain';
import { discountValidation } from '@maple/ts/validation';
import type {
  CreateDiscountRequest,
  CreateDiscountResponse,
} from '@maple/ts/firebase/api-types';

export const createDiscount = Functions.endpoint
  .requiringRole([Role.Admin, Role.MtTeacher])
  .handle<CreateDiscountRequest, CreateDiscountResponse>(
    async (data, context) => {
      await assertCanManageDiscountProgram(context, data.program);

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
        // Name the owning program — otherwise "already exists" is baffling to
        // an mt-teacher who cannot see the classes code that collided.
        throwFailedPrecondition(
          `Discount code "${data.code.toUpperCase()}" already exists (${discountProgramLabel(
            existing.program
          )}).`
        );
      }

      const discount = await DiscountRepository.create(data);

      return { discount };
    }
  );
