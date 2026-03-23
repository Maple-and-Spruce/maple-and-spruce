import { createAdminFunction } from '@maple/firebase/functions';
import { CalendarEmbedConfigRepository } from '@maple/firebase/database';
import type {
  AddCalendarEmbedSourceRequest,
  AddCalendarEmbedSourceResponse,
} from '@maple/ts/firebase/api-types';

export const addCalendarEmbedSource = createAdminFunction<
  AddCalendarEmbedSourceRequest,
  AddCalendarEmbedSourceResponse
>(async (data) => {
  if (!data.label || !data.url) {
    throw new Error('Label and URL are required');
  }
  const config = await CalendarEmbedConfigRepository.addSource(data);
  return { config };
});
