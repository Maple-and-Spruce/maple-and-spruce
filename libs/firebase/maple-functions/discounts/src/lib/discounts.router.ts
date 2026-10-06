/**
 * discounts — the staff side of discount codes, as one Cloud Function
 * (ADR-029, #62).
 *
 * Every route is gated `[Admin, MtTeacher]` so Stephanie can run her own Music
 * Together promotions. The role gate is only half of it: the program helpers
 * narrow a non-admin to `music-together` codes, never Maple & Spruce class
 * codes, which bill to a different business.
 *
 * `lookupDiscount` is deliberately not here. It is the public checkout
 * endpoint both Webflow widgets call, its App Check rollout is in flight, and
 * moving it means a Webflow publish — so it stays its own function for now.
 *
 * Each route spells its gate out in full: `tools/check-callable-roles.ts` reads
 * `requiringRole` off the AST and cannot see through a helper.
 */
import {
  Functions,
  Role,
  assertCanManageDiscountProgram,
  discountProgramScopeForUser,
  throwFailedPrecondition,
  throwInvalidArgument,
  throwNotFound,
  throwValidationError,
} from '@maple/firebase/functions';
import { DiscountRepository } from '@maple/firebase/database';
import { discountProgramLabel } from '@maple/ts/domain';
import { discountValidation } from '@maple/ts/validation';
import type {
  CreateDiscountRequest,
  CreateDiscountResponse,
  DeleteDiscountRequest,
  DeleteDiscountResponse,
  GetDiscountsRequest,
  GetDiscountsResponse,
  UpdateDiscountRequest,
  UpdateDiscountResponse,
} from '@maple/ts/firebase/api-types';

export const discounts = Functions.router('discounts', {
  /**
   * Discounts with optional status + program filters. A non-admin caller is
   * **forced** to the `music-together` program regardless of what the request
   * asked for — the client's `program` is a filter for admins, never an
   * authorization input.
   */
  getDiscounts: Functions.endpoint
    .requiringRole([Role.Admin, Role.MtTeacher])
    .asRoute<GetDiscountsRequest, GetDiscountsResponse>(
      async (data, context) => {
        const forcedProgram = await discountProgramScopeForUser(context);

        const discounts = await DiscountRepository.findAll({
          status: data.status,
          program: forcedProgram ?? data.program,
        });

        return { discounts };
      }
    ),

  /**
   * Codes are globally unique across programs. That is deliberate: a customer
   * types a code without knowing which program owns it, so one string must
   * mean one thing everywhere. Reusing a classes code for Music Together is
   * rejected here rather than resolved by context.
   */
  createDiscount: Functions.endpoint
    .requiringRole([Role.Admin, Role.MtTeacher])
    .asRoute<CreateDiscountRequest, CreateDiscountResponse>(
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
          // Name the owning program — otherwise "already exists" is baffling
          // to an mt-teacher who cannot see the classes code that collided.
          throwFailedPrecondition(
            `Discount code "${data.code.toUpperCase()}" already exists (${discountProgramLabel(
              existing.program
            )}).`
          );
        }

        const discount = await DiscountRepository.create(data);

        return { discount };
      }
    ),

  /**
   * Authorized on the STORED program — the one whose money is at stake. There
   * is no `program` on the update input at all: `program` is immutable, so a
   * code can never be moved between businesses after customers hold it.
   */
  updateDiscount: Functions.endpoint
    .requiringRole([Role.Admin, Role.MtTeacher])
    .asRoute<UpdateDiscountRequest, UpdateDiscountResponse>(
      async (data, context) => {
        if (!data.id) {
          throwInvalidArgument('Discount ID is required');
        }

        const existing = await DiscountRepository.findById(data.id);
        if (!existing) {
          throwNotFound('Discount', data.id);
        }

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
              `Discount code "${data.code.toUpperCase()}" already exists`
            );
          }
        }

        const discount = await DiscountRepository.update(data);

        return { discount };
      }
    ),

  /** Narrowed on the STORED program: an mt-teacher deletes Music Together codes only. */
  deleteDiscount: Functions.endpoint
    .requiringRole([Role.Admin, Role.MtTeacher])
    .asRoute<DeleteDiscountRequest, DeleteDiscountResponse>(
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
    ),
});
