/**
 * Get Discounts Cloud Function
 *
 * Retrieves discounts with optional status + program filters.
 *
 * Gated `[Admin, MtTeacher]` so Stephanie's Music Together discounts page can
 * read her own codes. The role gate alone would show her Maple & Spruce class
 * codes too, so a non-admin caller is **forced** to the `music-together`
 * program here regardless of what the request asked for — the client's
 * `program` is a filter for admins, never an authorization input.
 *
 * Deployed to us-east4 via CI/CD pipeline.
 */
import {
  Functions,
  Role,
  discountProgramScopeForUser,
} from '@maple/firebase/functions';
import { DiscountRepository } from '@maple/firebase/database';
import type {
  GetDiscountsRequest,
  GetDiscountsResponse,
} from '@maple/ts/firebase/api-types';

export const getDiscounts = Functions.endpoint
  .requiringRole([Role.Admin, Role.MtTeacher])
  .handle<GetDiscountsRequest, GetDiscountsResponse>(async (data, context) => {
    const forcedProgram = await discountProgramScopeForUser(context);

    const discounts = await DiscountRepository.findAll({
      status: data.status,
      program: forcedProgram ?? data.program,
    });

    return { discounts };
  });
