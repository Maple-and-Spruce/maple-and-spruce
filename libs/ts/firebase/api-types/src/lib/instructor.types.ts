/**
 * Instructor API request/response types
 *
 * Types for Firebase Cloud Function calls related to instructors.
 * These are shared between client and server for type-safe API calls.
 */
import type {
  Instructor,
  CreateInstructorInput,
  UpdateInstructorInput,
  PublicInstructor,
  PayeeStatus,
} from '@maple/ts/domain';

// ============================================================================
// Get Instructors
// ============================================================================

export interface GetInstructorsRequest {
  /** Optional status filter */
  status?: PayeeStatus;
}

export interface GetInstructorsResponse {
  instructors: Instructor[];
}

// ============================================================================
// Get Instructor by ID
// ============================================================================

export interface GetInstructorRequest {
  id: string;
}

export interface GetInstructorResponse {
  instructor: Instructor;
}

// ============================================================================
// Create Instructor
// ============================================================================

export interface CreateInstructorRequest extends CreateInstructorInput {}

export interface CreateInstructorResponse {
  instructor: Instructor;
}

// ============================================================================
// Update Instructor
// ============================================================================

export interface UpdateInstructorRequest extends UpdateInstructorInput {}

export interface UpdateInstructorResponse {
  instructor: Instructor;
}

// ============================================================================
// Delete Instructor
// ============================================================================

export interface DeleteInstructorRequest {
  id: string;
}

export interface DeleteInstructorResponse {
  success: boolean;
}

// ============================================================================
// Upload Instructor Image
// ============================================================================

export interface UploadInstructorImageRequest {
  /** Instructor ID (optional - can upload before creating instructor) */
  instructorId?: string;
  /** Base64-encoded image data */
  imageBase64: string;
  /** MIME type of the image (e.g., 'image/jpeg', 'image/png') */
  contentType: string;
}

export interface UploadInstructorImageResponse {
  success: boolean;
  /** Public URL of the uploaded image */
  url: string;
}

// ============================================================================
// Get Public Instructors (no auth required - for Webflow integration)
// ============================================================================

/**
 * Request for public instructors endpoint.
 * Currently empty but structured for future pagination support.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface GetPublicInstructorsRequest {}

export interface GetPublicInstructorsResponse {
  /** Active instructors with sensitive data stripped */
  instructors: PublicInstructor[];
}
