import {
  pgTable,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  time,
  index,
} from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

// Users table
export const users = pgTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId()),
  email: text('email').notNull().unique(),
  phone: text('phone'),
  pushTokens: jsonb('push_tokens').$type<string[]>().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Notification preferences table
export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(), // 'email' | 'sms' | 'push' | 'in_app'
    eventType: text('event_type').notNull(), // 'account' | 'security' | 'marketing' | 'system'
    enabled: boolean('enabled').notNull().default(true),
    quietHoursStart: time('quiet_hours_start'), // e.g., '22:00:00'
    quietHoursEnd: time('quiet_hours_end'), // e.g., '08:00:00'
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userChannelEventIdx: index('user_channel_event_idx').on(
      table.userId,
      table.channel,
      table.eventType
    ),
  })
);

// Notification templates table
export const notificationTemplates = pgTable(
  'notification_templates',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    channel: text('channel').notNull(),
    eventType: text('event_type').notNull(),
    subject: text('subject'), // for email
    body: text('body').notNull(),
    variables: jsonb('variables').$type<string[]>().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    channelEventIdx: index('channel_event_idx').on(table.channel, table.eventType),
  })
);

// Notification deliveries table
export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(),
    eventType: text('event_type').notNull(),
    eventId: text('event_id').notNull(), // idempotency key
    status: text('status').notNull(), // 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced'
    attemptCount: integer('attempt_count').notNull().default(0),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  },
  (table) => ({
    userIdIdx: index('deliveries_user_id_idx').on(table.userId),
    statusIdx: index('deliveries_status_idx').on(table.status),
    createdAtIdx: index('deliveries_created_at_idx').on(table.createdAt),
    eventUserChannelIdx: index('event_user_channel_idx').on(
      table.eventId,
      table.userId,
      table.channel
    ),
  })
);

// Types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreference = typeof notificationPreferences.$inferInsert;

export type NotificationTemplate = typeof notificationTemplates.$inferSelect;
export type NewNotificationTemplate = typeof notificationTemplates.$inferInsert;

export type NotificationDelivery = typeof notificationDeliveries.$inferSelect;
export type NewNotificationDelivery = typeof notificationDeliveries.$inferInsert;
