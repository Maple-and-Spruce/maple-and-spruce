/**
 * POS Lesson Attribution API request/response types (#628 PR 2).
 *
 * Admin review queue for in-person Square POS lesson sales that couldn't be
 * auto-attributed to a student, plus the lesson-catalog config that decides
 * which POS items are lessons.
 */
import type {
  PosLessonAttribution,
  PosLessonAttributionStatus,
  PosLessonAttributionSummary,
  PosLessonConfig,
} from '@maple/ts/domain';

// ============================================================================
// List / summary
// ============================================================================

export interface GetPosLessonAttributionsRequest {
  status?: PosLessonAttributionStatus;
}

export interface GetPosLessonAttributionsResponse {
  attributions: PosLessonAttribution[];
}

export interface GetPosLessonAttributionSummaryRequest {
  _?: never;
}

export interface GetPosLessonAttributionSummaryResponse {
  summary: PosLessonAttributionSummary;
}

// ============================================================================
// Resolve (attribute to a student, or dismiss)
// ============================================================================

export type PosLessonResolution = 'attribute' | 'dismiss';

export interface ResolvePosLessonAttributionRequest {
  attributionId: string;
  action: PosLessonResolution;
  /** Required when action === 'attribute'. */
  studentId?: string;
  /** Optional memo, used when dismissing. */
  notes?: string;
}

export interface ResolvePosLessonAttributionResponse {
  attribution: PosLessonAttribution;
}

// ============================================================================
// Lesson-catalog config
// ============================================================================

export interface GetPosLessonConfigRequest {
  _?: never;
}

export interface GetPosLessonConfigResponse {
  config: PosLessonConfig;
}

export interface UpdatePosLessonConfigRequest {
  lessonCatalogObjectIds: string[];
}

export interface UpdatePosLessonConfigResponse {
  config: PosLessonConfig;
}
