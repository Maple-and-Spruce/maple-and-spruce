import { createAdminFunction } from '@maple/firebase/functions';
import { CalendarEmbedConfigRepository } from '@maple/firebase/database';
import type {
  GetCalendarEmbedConfigRequest,
  GetCalendarEmbedConfigResponse,
} from '@maple/ts/firebase/api-types';

export const getCalendarEmbedConfig = createAdminFunction<
  GetCalendarEmbedConfigRequest,
  GetCalendarEmbedConfigResponse
>(async () => {
  const config = await CalendarEmbedConfigRepository.get();
  return { config };
});
