/**
 * Student API request/response types
 *
 * Types for Firebase Cloud Function calls related to music lesson students.
 * Shared between client and server for type-safe API calls.
 */
import type {
  Student,
  CreateStudentInput,
  UpdateStudentInput,
  StudentStatus,
} from '@maple/ts/domain';

// ============================================================================
// Get Students
// ============================================================================

export interface GetStudentsRequest {
  /** Optional status filter */
  status?: StudentStatus;
  /** Optional filter by primary teacher */
  primaryTeacherId?: string;
  /** Optional Hope Scholarship filter */
  isHopeScholarship?: boolean;
}

export interface GetStudentsResponse {
  students: Student[];
}

// ============================================================================
// Get Student by ID
// ============================================================================

export interface GetStudentRequest {
  id: string;
}

export interface GetStudentResponse {
  student: Student;
}

// ============================================================================
// Create Student
// ============================================================================

export interface CreateStudentRequest extends CreateStudentInput {}

export interface CreateStudentResponse {
  student: Student;
}

// ============================================================================
// Update Student
// ============================================================================

export interface UpdateStudentRequest extends UpdateStudentInput {}

export interface UpdateStudentResponse {
  student: Student;
}

// ============================================================================
// Delete Student
// ============================================================================

export interface DeleteStudentRequest {
  id: string;
}

export interface DeleteStudentResponse {
  success: boolean;
}
