import { z } from 'zod';

// Event types
export const eventTypeSchema = z.enum(['account', 'security', 'marketing', 'system']);
export type EventType = z.infer<typeof eventTypeSchema>;

// Channels
export const channelSchema = z.enum(['email', 'sms', 'push', 'in_app']);
export type Channel = z.infer<typeof channelSchema>;

// Priority levels
export const prioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);
export type Priority = z.infer<typeof prioritySchema>;

// Delivery status
export const deliveryStatusSchema = z.enum(['pending', 'sent', 'delivered', 'failed', 'bounced']);
export type DeliveryStatus = z.infer<typeof deliveryStatusSchema>;

// Notification Event (incoming from external sources)
export const notificationEventSchema = z.object({
  eventId: z.string().min(1),
  eventType: eventTypeSchema,
  userId: z.string().min(1),
  channels: z.array(channelSchema).min(1),
  priority: prioritySchema.default('normal'),
  data: z.record(z.unknown()),
  scheduledAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z
    .string()
    .datetime()
    .default(() => new Date().toISOString()),
});

export type NotificationEvent = z.infer<typeof notificationEventSchema>;

// User creation
export const createUserSchema = z.object({
  email: z.string().email(),
  phone: z.string().optional(),
  pushTokens: z.array(z.string()).optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

// Preference creation
export const createPreferenceSchema = z.object({
  userId: z.string().min(1),
  channel: channelSchema,
  eventType: eventTypeSchema,
  enabled: z.boolean().default(true),
  quietHoursStart: z
    .string()
    .regex(/^\d{2}:\d{2}:\d{2}$/)
    .optional(), // HH:MM:SS
  quietHoursEnd: z
    .string()
    .regex(/^\d{2}:\d{2}:\d{2}$/)
    .optional(),
});

export type CreatePreferenceInput = z.infer<typeof createPreferenceSchema>;

// Preference update
export const updatePreferenceSchema = createPreferenceSchema.partial().omit({
  userId: true,
  channel: true,
  eventType: true,
});

export type UpdatePreferenceInput = z.infer<typeof updatePreferenceSchema>;

// Template creation
export const createTemplateSchema = z.object({
  channel: channelSchema,
  eventType: eventTypeSchema,
  subject: z.string().optional(),
  body: z.string().min(1),
  variables: z.array(z.string()).default([]),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

// Template update
export const updateTemplateSchema = createTemplateSchema.partial().omit({
  channel: true,
  eventType: true,
});

export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
