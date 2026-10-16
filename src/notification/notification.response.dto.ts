import { NotificationZodSchema } from '../lib/mongo/zod';
import { paginatedSchema } from '../lib/util/Pagination';

import type { z } from 'zod';

export const PaginatedNotificationsDtoSchema = paginatedSchema(NotificationZodSchema).meta({
	id: 'PaginatedNotificationsDto',
});
export type PaginatedNotificationsDto = z.infer<typeof PaginatedNotificationsDtoSchema>;
