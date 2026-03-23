import { createAdminFunction } from '@maple/firebase/functions';
import { CalendarEmbedConfigRepository } from '@maple/firebase/database';
import type {
  RemoveCalendarEmbedSourceRequest,
  RemoveCalendarEmbedSourceResponse,
} from '@maple/ts/firebase/api-types';

export const removeCalendarEmbedSource = createAdminFunction<
  RemoveCalendarEmbedSourceRequest,
  RemoveCalendarEmbedSourceResponse
>(async (data) => {
  if (!data.sourceId) {
    throw new Error('Source ID is required');
  }
  const config = await CalendarEmbedConfigRepository.removeSource(data.sourceId);
  return { config };
});
