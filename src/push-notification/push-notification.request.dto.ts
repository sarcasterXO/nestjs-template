import { z } from 'zod';

const pushSubscriptionSchema = z.object({
	endpoint: z.url(),
	keys: z.object({
		p256dh: z.string().min(1),
		auth: z.string().min(1),
	}),
});
export const PushSubscriptionDtoSchema = pushSubscriptionSchema.meta({ id: 'PushSubscriptionDto' });
export type PushSubscriptionDto = z.infer<typeof PushSubscriptionDtoSchema>;
