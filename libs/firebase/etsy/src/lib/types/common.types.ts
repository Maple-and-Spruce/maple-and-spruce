/**
 * Shared Etsy API types
 *
 * Common types used across multiple Etsy API endpoints.
 */

/** Standard Etsy API error response */
export interface EtsyApiError {
  error: string;
  error_description?: string;
}

/** Paginated response wrapper */
export interface EtsyPaginatedResponse<T> {
  count: number;
  results: T[];
}

/** Etsy price representation */
export interface EtsyMoney {
  amount: number;
  divisor: number;
  currency_code: string;
}

/** Who made the item */
export type EtsyWhoMade = 'i_did' | 'someone_else' | 'collective';

/** When the item was made */
export type EtsyWhenMade =
  | 'made_to_order'
  | '2020_2025'
  | '2010_2019'
  | '2002_2009'
  | 'before_2002'
  | '2000_2001'
  | '1990s'
  | '1980s'
  | '1970s'
  | '1960s'
  | '1950s'
  | '1940s'
  | '1930s'
  | '1920s'
  | '1910s'
  | '1900s'
  | '1800s'
  | '1700s'
  | 'before_1700';

/** Listing state */
export type EtsyListingState =
  | 'active'
  | 'inactive'
  | 'sold_out'
  | 'draft'
  | 'expired';

/** Weight unit */
export type EtsyWeightUnit = 'oz' | 'lb' | 'g' | 'kg';

/** Dimension unit */
export type EtsyDimensionUnit = 'in' | 'ft' | 'mm' | 'cm' | 'm' | 'yd';
