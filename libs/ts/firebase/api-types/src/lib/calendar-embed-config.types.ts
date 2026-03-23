/**
 * Calendar Embed Config API request/response types
 */
import type {
  CalendarEmbedConfig,
  CreateCalendarEmbedSourceInput,
  UpdateCalendarEmbedSettingsInput,
} from '@maple/ts/domain';

// ============================================================================
// Get Calendar Embed Config
// ============================================================================

export interface GetCalendarEmbedConfigRequest {
  // no params needed
}

export interface GetCalendarEmbedConfigResponse {
  config: CalendarEmbedConfig;
}

// ============================================================================
// Update Calendar Embed Settings
// ============================================================================

export interface UpdateCalendarEmbedConfigRequest
  extends UpdateCalendarEmbedSettingsInput {}

export interface UpdateCalendarEmbedConfigResponse {
  config: CalendarEmbedConfig;
}

// ============================================================================
// Add Calendar Embed Source
// ============================================================================

export interface AddCalendarEmbedSourceRequest
  extends CreateCalendarEmbedSourceInput {}

export interface AddCalendarEmbedSourceResponse {
  config: CalendarEmbedConfig;
}

// ============================================================================
// Remove Calendar Embed Source
// ============================================================================

export interface RemoveCalendarEmbedSourceRequest {
  sourceId: string;
}

export interface RemoveCalendarEmbedSourceResponse {
  config: CalendarEmbedConfig;
}
