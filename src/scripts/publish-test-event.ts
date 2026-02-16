#!/usr/bin/env tsx
import { getJetStream, closeNatsConnection } from '../lib/nats';
import { db } from '../lib/db';
import { users } from '../lib/db/schema';
import { createId } from '@paralleldrive/cuid2';

async function publishTestEvent() {
  console.log('📤 Publishing test event...');

  // Get a sample user
  const [user] = await db.select().from(users).limit(1);

  if (!user) {
    console.error('❌ No users found in database. Run "pnpm db:seed" first.');
    process.exit(1);
  }

  const js = await getJetStream();

  const testEvent = {
    eventId: createId(),
    eventType: 'account',
    userId: user.id,
    channels: ['email', 'push', 'in_app'],
    priority: 'normal',
    data: {
      userName: user.email.split('@')[0],
      appName: 'NotificationApp',
      actionUrl: 'https://example.com/verify',
    },
    createdAt: new Date().toISOString(),
  };

  const data = new TextEncoder().encode(JSON.stringify(testEvent));
  await js.publish('notifications.events', data);

  console.log('✅ Test event published:');
  console.log(JSON.stringify(testEvent, null, 2));

  await closeNatsConnection();
  process.exit(0);
}

publishTestEvent().catch((err) => {
  console.error('❌ Failed to publish test event:', err);
  process.exit(1);
});
