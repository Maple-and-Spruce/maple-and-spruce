/**
 * Etsy Listing Service
 *
 * CRUD operations for Etsy shop listings. Handles creating draft listings,
 * updating fields, uploading images, and activating listings.
 *
 * @see https://developers.etsy.com/documentation/reference/
 */
import type { EtsyHttp } from '../http/etsy-http.js';
import type {
  EtsyListing,
  EtsyListingImage,
  CreateDraftListingInput,
  UpdateListingInput,
} from '../types/listing.types.js';
import type { EtsyPaginatedResponse } from '../types/common.types.js';

export class ListingService {
  constructor(
    private readonly http: EtsyHttp,
    private readonly shopId: () => Promise<string>
  ) {}

  /**
   * Get a single listing by ID.
   *
   * @param listingId - Etsy listing ID
   * @param includes - Optional includes (e.g., "Images", "Inventory", "Images,Inventory")
   */
  async getListing(
    listingId: number,
    includes?: string
  ): Promise<EtsyListing> {
    const params: Record<string, string> = {};
    if (includes) {
      params['includes'] = includes;
    }
    return this.http.get<EtsyListing>(
      `/listings/${listingId}`,
      params
    );
  }

  /**
   * Get all active listings for the connected shop.
   *
   * @param options - Pagination and include options
   * @returns Paginated listing results
   */
  async getActiveListings(options?: {
    limit?: number;
    offset?: number;
    includes?: string;
  }): Promise<EtsyPaginatedResponse<EtsyListing>> {
    const id = await this.shopId();
    const params: Record<string, string> = {
      state: 'active',
    };
    if (options?.limit) params['limit'] = String(options.limit);
    if (options?.offset) params['offset'] = String(options.offset);
    if (options?.includes) params['includes'] = options.includes;

    return this.http.get<EtsyPaginatedResponse<EtsyListing>>(
      `/shops/${id}/listings`,
      params
    );
  }

  /**
   * Get all listings for the shop (any state).
   *
   * @param state - Filter by listing state
   * @param options - Pagination and include options
   */
  async getListings(
    state?: string,
    options?: {
      limit?: number;
      offset?: number;
      includes?: string;
    }
  ): Promise<EtsyPaginatedResponse<EtsyListing>> {
    const id = await this.shopId();
    const params: Record<string, string> = {};
    if (state) params['state'] = state;
    if (options?.limit) params['limit'] = String(options.limit);
    if (options?.offset) params['offset'] = String(options.offset);
    if (options?.includes) params['includes'] = options.includes;

    return this.http.get<EtsyPaginatedResponse<EtsyListing>>(
      `/shops/${id}/listings`,
      params
    );
  }

  /**
   * Create a draft listing.
   *
   * Draft listings are not visible to buyers until activated.
   *
   * @param input - Listing fields
   * @returns The created draft listing
   */
  async createDraftListing(
    input: CreateDraftListingInput
  ): Promise<EtsyListing> {
    const id = await this.shopId();
    return this.http.post<EtsyListing>(`/shops/${id}/listings`, {
      title: input.title,
      description: input.description,
      price: input.price,
      quantity: input.quantity,
      taxonomy_id: input.taxonomy_id,
      who_made: input.who_made,
      when_made: input.when_made,
      is_supply: input.is_supply,
      shipping_profile_id: input.shipping_profile_id,
      shop_section_id: input.shop_section_id,
      tags: input.tags,
      materials: input.materials,
      return_policy_id: input.return_policy_id,
      processing_min: input.processing_min,
      processing_max: input.processing_max,
    });
  }

  /**
   * Update an existing listing.
   *
   * Only include fields that should change. To activate a draft listing,
   * set `state: 'active'`.
   *
   * @param listingId - Etsy listing ID
   * @param input - Fields to update
   * @returns The updated listing
   */
  async updateListing(
    listingId: number,
    input: UpdateListingInput
  ): Promise<EtsyListing> {
    const id = await this.shopId();
    return this.http.patch<EtsyListing>(
      `/shops/${id}/listings/${listingId}`,
      input as Record<string, unknown>
    );
  }

  /**
   * Upload an image to a listing.
   *
   * @param listingId - Etsy listing ID
   * @param imageBuffer - Image file as a Buffer
   * @param filename - Original filename (e.g., "product.jpg")
   * @param contentType - MIME type (e.g., "image/jpeg")
   * @param rank - Image display order (1-10, default 1)
   * @returns The uploaded image metadata
   */
  async uploadListingImage(
    listingId: number,
    imageBuffer: Buffer,
    filename: string,
    contentType: string,
    rank = 1
  ): Promise<EtsyListingImage> {
    const id = await this.shopId();
    const formData = new FormData();
    const blob = new Blob([imageBuffer], { type: contentType });
    formData.append('image', blob, filename);
    formData.append('rank', String(rank));

    return this.http.postMultipart<EtsyListingImage>(
      `/shops/${id}/listings/${listingId}/images`,
      formData
    );
  }

  /**
   * Activate a draft listing (make it visible to buyers).
   *
   * The listing must have at least one image and a shipping profile.
   *
   * @param listingId - Etsy listing ID
   * @returns The activated listing
   */
  async activateListing(listingId: number): Promise<EtsyListing> {
    const id = await this.shopId();
    return this.http.patch<EtsyListing>(
      `/shops/${id}/listings/${listingId}`,
      { state: 'active' }
    );
  }

  /**
   * Delete a listing.
   *
   * @param listingId - Etsy listing ID
   */
  async deleteListing(listingId: number): Promise<void> {
    const id = await this.shopId();
    await this.http.delete(`/shops/${id}/listings/${listingId}`);
  }
}
