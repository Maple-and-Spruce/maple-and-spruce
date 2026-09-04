/**
 * Lookup Discount Cloud Function
 *
 * Looks up a discount by code and returns it if it is valid AND belongs to the
 * program doing the asking. Public endpoint — used by both checkout widgets
 * (Maple & Spruce classes and Music Together).
 *
 * A code from another program returns `{ discount: undefined }` — the exact
 * shape an unknown code returns. That is deliberate: this endpoint is
 * unauthenticated, so distinguishing "wrong program" from "no such code" would
 * let anyone enumerate the other business's live promotions.
 *
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { createPublicFunction } from '@maple/firebase/functions';
import { DiscountRepository } from '@maple/firebase/database';
import { isDiscountValid, isDiscountForProgram } from '@maple/ts/domain';
import type { DiscountProgram } from '@maple/ts/domain';
import type {
  LookupDiscountRequest,
  LookupDiscountResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Program assumed when a caller sends none. Older deployed widget bundles
 * predate scoping, and every code that existed then was a classes code — so
 * this keeps them working exactly as before rather than breaking checkout
 * during the window between a function deploy and a Webflow publish.
 */
const DEFAULT_PROGRAM: DiscountProgram = 'classes';

export const lookupDiscount = createPublicFunction<
  LookupDiscountRequest,
  LookupDiscountResponse
>(async (data) => {
  if (!data.code || typeof data.code !== 'string') {
    return { discount: undefined };
  }

  const discount = await DiscountRepository.findByCode(data.code);

  if (!discount || !isDiscountValid(discount)) {
    return { discount: undefined };
  }
  if (!isDiscountForProgram(discount, data.program ?? DEFAULT_PROGRAM)) {
    return { discount: undefined };
  }

  return { discount };
});
