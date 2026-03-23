import { createAdminFunction } from '@maple/firebase/functions';
import { CalendarEmbedConfigRepository } from '@maple/firebase/database';
import type {
  UpdateCalendarEmbedConfigRequest,
  UpdateCalendarEmbedConfigResponse,
} from '@maple/ts/firebase/api-types';

export const updateCalendarEmbedConfig = createAdminFunction<
  UpdateCalendarEmbedConfigRequest,
  UpdateCalendarEmbedConfigResponse
>(async (data) => {
  const config = await CalendarEmbedConfigRepository.update(data);
  return { config };
});
