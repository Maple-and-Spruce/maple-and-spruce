/**
 * EMA product API contracts (WV Hope Scholarship). Routes on the `hope` router.
 */
import type {
  HopeOrder,
  HopeProduct,
  SaveHopeOrderInput,
  SaveHopeProductInput,
} from '@maple/ts/domain';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GetHopeProductsRequest {}

export interface GetHopeProductsResponse {
  /** Every product, active or not, ordered by name. */
  products: HopeProduct[];
}

export type SaveHopeProductRequest = SaveHopeProductInput;

export interface SaveHopeProductResponse {
  product: HopeProduct;
}

export type SaveHopeOrderRequest = SaveHopeOrderInput;

export interface SaveHopeOrderResponse {
  order: HopeOrder;
}
