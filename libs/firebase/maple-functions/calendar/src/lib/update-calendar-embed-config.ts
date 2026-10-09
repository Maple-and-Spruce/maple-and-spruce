import { CalendarEmbedConfigRepository } from '@maple/firebase/database';
import type {
  UpdateCalendarEmbedConfigRequest,
  UpdateCalendarEmbedConfigResponse,
} from '@maple/ts/firebase/api-types';

export async function updateCalendarEmbedConfig(
  data: UpdateCalendarEmbedConfigRequest,
): Promise<UpdateCalendarEmbedConfigResponse> {
  const config = await CalendarEmbedConfigRepository.update(data);
  return { config };
}
