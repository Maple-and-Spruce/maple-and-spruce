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
import {
  Functions,
  Role,
  assertValid,
  throwInvalidArgument,
  throwNotFound,
} from '@maple/firebase/functions';
import {
  HopeOrderRepository,
  HopeProductRepository,
  HopeSubmissionRepository,
  StudentRepository,
} from '@maple/firebase/database';
import { isHopeInvoiced } from '@maple/ts/domain';
import {
  hopeOrderValidation,
  hopeProductValidation,
} from '@maple/ts/validation';
import type {
  GetHopeProductsRequest,
  GetHopeProductsResponse,
  GetHopeQueueRequest,
  GetHopeQueueResponse,
  RecordHopeSubmissionsRequest,
  RecordHopeSubmissionsResponse,
  SaveHopeOrderRequest,
  SaveHopeOrderResponse,
  SaveHopeProductRequest,
  SaveHopeProductResponse,
} from '@maple/ts/firebase/api-types';
import { getHopeQueue } from './get-hope-queue';
import { recordHopeSubmissions } from './record-hope-submissions';

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

  /**
   * Record an EMA order a Hope family placed, or correct one.
   *
   * The price is copied from the product when the order is recorded (or its
   * product changed), so a later price change does not rewrite what an order
   * already placed is worth. An order's count cannot drop below the lessons
   * already invoiced against it: those invoices exist in the portal.
   */
  saveHopeOrder: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<SaveHopeOrderRequest, SaveHopeOrderResponse>(async (data) => {
      assertValid(hopeOrderValidation(data));

      const student = await StudentRepository.findById(data.studentId);
      if (!student) throwNotFound('Student', data.studentId);
      if (!student.isHopeScholarship) {
        throwInvalidArgument('Only Hope Scholarship students have EMA orders.');
      }

      const product = await HopeProductRepository.findById(data.productId);
      if (!product) throwNotFound('EMA product', data.productId);

      let priceCents = product.priceCents;
      if (data.id) {
        const existing = await HopeOrderRepository.findById(data.id);
        if (!existing) throwNotFound('EMA order', data.id);
        if (existing.studentId !== data.studentId) {
          throwInvalidArgument('An order cannot be moved to another student.');
        }
        if (existing.productId === data.productId) {
          priceCents = existing.priceCents;
        }
        const invoiced = (
          await HopeSubmissionRepository.findByOrderId(data.id)
        ).filter((s) => isHopeInvoiced(s)).length;
        if (data.lessonCount < invoiced) {
          throwInvalidArgument(
            `${invoiced} lessons are already invoiced against this order, so it cannot be for fewer.`,
          );
        }
      }

      const order = await HopeOrderRepository.save({
        id: data.id,
        studentId: data.studentId,
        productId: data.productId,
        priceCents,
        lessonCount: data.lessonCount,
        emaOrderId: data.emaOrderId,
        orderedOn: new Date(data.orderedOn),
        notes: data.notes,
      });
      return { order };
    }),

  /** Rendered Hope lessons and where each stands in the claim process. */
  getHopeQueue: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<GetHopeQueueRequest, GetHopeQueueResponse>(getHopeQueue),

  /** Mark lessons submitted to the Hope portal, or paid. */
  recordHopeSubmissions: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<RecordHopeSubmissionsRequest, RecordHopeSubmissionsResponse>(
      recordHopeSubmissions,
    ),
});
