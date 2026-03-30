/**
 * Etsy Taxonomy API types
 *
 * Types for the seller taxonomy endpoints used to categorize listings.
 *
 * @see https://developers.etsy.com/documentation/reference/
 */

/** A node in Etsy's seller taxonomy tree */
export interface EtsyTaxonomyNode {
  id: number;
  level: number;
  name: string;
  parent_id: number | null;
  children: EtsyTaxonomyNode[];
  full_path_taxonomy_ids: number[];
}

/** Response from GET /seller-taxonomy/nodes */
export interface EtsyTaxonomyResponse {
  count: number;
  results: EtsyTaxonomyNode[];
}
