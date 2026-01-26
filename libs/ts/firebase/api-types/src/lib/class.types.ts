/**
 * Class API request/response types
 *
 * Types for Firebase Cloud Function calls related to classes/workshops.
 * These are shared between client and server for type-safe API calls.
 */
import type {
  Class,
  CreateClassInput,
  UpdateClassInput,
  ClassStatus,
  ClassSkillLevel,
  PublicClass,
} from '@maple/ts/domain';

// ============================================================================
// Get Classes (Admin)
// ============================================================================

export interface GetClassesRequest {
  /** Optional status filter */
  status?: ClassStatus;
  /** Filter by category */
  categoryId?: string;
  /** Filter by instructor */
  instructorId?: string;
  /** Only return classes scheduled in the future */
  upcoming?: boolean;
}

export interface GetClassesResponse {
  classes: Class[];
}

// ============================================================================
// Get Class by ID
// ============================================================================

export interface GetClassRequest {
  id: string;
}

export interface GetClassResponse {
  class: Class;
}

// ============================================================================
// Create Class
// ============================================================================

export interface CreateClassRequest extends CreateClassInput {}

export interface CreateClassResponse {
  class: Class;
}

// ============================================================================
// Update Class
// ============================================================================

export interface UpdateClassRequest extends UpdateClassInput {}

export interface UpdateClassResponse {
  class: Class;
}

// ============================================================================
// Delete Class
// ============================================================================

export interface DeleteClassRequest {
  id: string;
}

export interface DeleteClassResponse {
  success: boolean;
}

// ============================================================================
// Upload Class Image
// ============================================================================

export interface UploadClassImageRequest {
  /** Class ID (optional - can upload before creating class) */
  classId?: string;
  /** Base64-encoded image data */
  imageBase64: string;
  /** MIME type of the image (e.g., 'image/jpeg', 'image/png') */
  contentType: string;
}

export interface UploadClassImageResponse {
  success: boolean;
  /** Public URL of the uploaded image */
  url: string;
}

// ============================================================================
// Get Public Classes (no auth required - for website/Webflow)
// ============================================================================

export interface GetPublicClassesRequest {
  /** Filter by category */
  categoryId?: string;
  /** Filter by skill level */
  skillLevel?: ClassSkillLevel;
  /** Only return upcoming classes (default: true) */
  upcoming?: boolean;
  /** Limit number of results */
  limit?: number;
}

export interface GetPublicClassesResponse {
  /** Published classes with enriched data (instructor name, spots remaining) */
  classes: PublicClass[];
}
