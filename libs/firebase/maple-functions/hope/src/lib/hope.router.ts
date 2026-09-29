/**
 * hope — the WV Hope Scholarship domain as one Cloud Function (ADR-029).
 *
 * Starts with the EMA product list: the studio's approved portal products and
 * their prices, which now set what a Hope lesson is worth. Orders and invoice
 * tracking join here as routes rather than as new functions, so the domain
 * costs one Cloud Run service against the deploy budget however much it grows.
 *
 * Each route spells its gate out in full: `tools/check-callable-roles.ts` reads
 * `requiringRole` off the AST and cannot see through a helper.
 */
import { Functions, Role, assertValid, throwNotFound } from '@maple/firebase/functions';
import { HopeProductRepository } from '@maple/firebase/database';
import { hopeProductValidation } from '@maple/ts/validation';
import type {
  GetHopeProductsRequest,
  GetHopeProductsResponse,
  SaveHopeProductRequest,
  SaveHopeProductResponse,
} from '@maple/ts/firebase/api-types';

export const hope = Functions.router('hope', {
  getHopeProducts: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<GetHopeProductsRequest, GetHopeProductsResponse>(async () => {
      return { products: await HopeProductRepository.findAll() };
    }),

  saveHopeProduct: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<SaveHopeProductRequest, SaveHopeProductResponse>(async (data) => {
      assertValid(hopeProductValidation(data));
      if (data.id && !(await HopeProductRepository.findById(data.id))) {
        throwNotFound('EMA product', data.id);
      }
      return { product: await HopeProductRepository.save(data) };
    }),
});
