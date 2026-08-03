/**
 * Discounts domain router — ADR-029, issue #731.
 *
 * ONE Cloud Function serving all five discount endpoints, replacing
 * getDiscounts / createDiscount / updateDiscount / deleteDiscount /
 * lookupDiscount. This is the Phase 0 pilot: the pattern established here is
 * what the remaining domains (#732–#744) copy.
 *
 * Routing: `httpsCallableFromURL(fn, `${DISCOUNTS_API_URL}/getDiscounts`)`.
 * The route name is the first path segment.
 *
 * NOTE the mixed auth. Four routes are admin-only; `lookupDiscount` is public
 * because the checkout form calls it before the customer has any identity.
 * Per-route options via `asRoute()` are exactly what makes that safe on a
 * shared function — the pipeline applies each route's own gate, so collapsing
 * endpoints never widens access. Getting this wrong would silently expose
 * admin CRUD, so the spec asserts the gate for every route individually.
 *
 * Deployed to us-east4 via CI/CD.
 */
import { Functions, Role } from '@maple/firebase/functions';
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
import {
  createDiscountHandler,
  deleteDiscountHandler,
  getDiscountsHandler,
  lookupDiscountHandler,
  updateDiscountHandler,
} from './handlers';

/** Route names, exported so clients and tests share one source of truth. */
export const DISCOUNT_ROUTES = [
  'getDiscounts',
  'createDiscount',
  'updateDiscount',
  'deleteDiscount',
  'lookupDiscount',
] as const;

export const discountsApi = Functions.router({
  getDiscounts: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<GetDiscountsRequest, GetDiscountsResponse>((data) =>
      getDiscountsHandler(data),
    ),

  createDiscount: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<CreateDiscountRequest, CreateDiscountResponse>((data) =>
      createDiscountHandler(data),
    ),

  updateDiscount: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<UpdateDiscountRequest, UpdateDiscountResponse>((data) =>
      updateDiscountHandler(data),
    ),

  deleteDiscount: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<DeleteDiscountRequest, DeleteDiscountResponse>((data) =>
      deleteDiscountHandler(data),
    ),

  // Public: the checkout form resolves codes for anonymous customers.
  lookupDiscount: Functions.endpoint.asRoute<
    LookupDiscountRequest,
    LookupDiscountResponse
  >((data) => lookupDiscountHandler(data)),
});
