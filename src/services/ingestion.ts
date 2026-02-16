import { JetStreamClient } from 'nats';
import { getJetStream, getJetStreamManager } from '../lib/nats';
import { getRedisClient } from '../lib/redis';
import { db } from '../lib/db';
import { users } from '../lib/db/schema';
import { eq } from 'drizzle-orm';
import { notificationEventSchema, type NotificationEvent } from '../types';

const EVENTS_SUBJECT = 'notifications.events';
const ENRICHED_SUBJECT = 'notifications.enriched';
const DEDUP_TTL = 3600; // 1 hour in seconds

interface EnrichedEvent extends NotificationEvent {
  enrichedAt: string;
  userEmail?: string;
  userPhone?: string;
  userPushTokens?: string[];
}

export class IngestionService {
  private js: JetStreamClient | null = null;
  private redis = getRedisClient();
  private running = false;

  async start(): Promise<void> {
    console.log('🚀 Starting Ingestion Service...');

    // Initialize NATS JetStream
    this.js = await getJetStream();
    const jsm = await getJetStreamManager();

    // Ensure stream exists
    try {
      await jsm.streams.info('notifications');
      console.log('✅ Stream "notifications" exists');
    } catch {
      console.log('Creating stream "notifications"...');
      await jsm.streams.add({
        name: 'notifications',
        subjects: ['notifications.>'],
        retention: 'limits',
        max_age: 86400_000_000_000, // 24 hours in nanoseconds
        storage: 'file',
      });
      console.log('✅ Stream "notifications" created');
    }

    // Ensure consumer exists
    try {
      await jsm.consumers.info('notifications', 'ingestion-consumer');
      console.log('✅ Consumer "ingestion-consumer" exists');
    } catch {
      console.log('Creating consumer "ingestion-consumer"...');
      await jsm.consumers.add('notifications', {
        durable_name: 'ingestion-consumer',
        ack_policy: 'explicit',
        filter_subject: EVENTS_SUBJECT,
      });
      console.log('✅ Consumer "ingestion-consumer" created');
    }

    // Subscribe to events using pull consumer
    const consumer = await this.js.consumers.get('notifications', 'ingestion-consumer');
    this.running = true;

    console.log(`✅ Subscribed to ${EVENTS_SUBJECT}`);
    console.log('🎧 Listening for events...');

    // Process messages
    while (this.running) {
      try {
        const messages = await consumer.fetch({ max_messages: 10, expires: 5000 });
        for await (const msg of messages) {
          try {
            await this.processEvent(msg.data, msg.seq);
            msg.ack();
          } catch (error) {
            console.error('❌ Error processing event:', error);
            msg.nak();
          }
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('timeout')) {
          // No messages available, continue
          continue;
        }
        console.error('❌ Error fetching messages:', error);
      }
    }
  }

  async stop(): Promise<void> {
    console.log('🛑 Stopping Ingestion Service...');
    this.running = false;
  }

  private async processEvent(data: Uint8Array, seq: number): Promise<void> {
    const startTime = Date.now();

    // Parse and validate event
    const rawEvent = JSON.parse(new TextDecoder().decode(data));
    const validationResult = notificationEventSchema.safeParse(rawEvent);

    if (!validationResult.success) {
      console.error('❌ Invalid event schema:', validationResult.error);
      throw new Error('Invalid event schema');
    }

    const event = validationResult.data;
    console.log(`📩 Received event ${event.eventId} (seq: ${seq})`);

    // Check for duplicates
    const isDuplicate = await this.checkDuplicate(event.eventId);
    if (isDuplicate) {
      console.log(`⚠️  Duplicate event ${event.eventId}, skipping`);
      return;
    }

    // Enrich event with user data
    const enrichedEvent = await this.enrichEvent(event);

    // Publish enriched event
    await this.publishEnrichedEvent(enrichedEvent);

    const duration = Date.now() - startTime;
    console.log(`✅ Processed event ${event.eventId} in ${duration}ms`);
  }

  private async checkDuplicate(eventId: string): Promise<boolean> {
    const key = `dedup:${eventId}`;
    const exists = await this.redis.get(key);

    if (exists) {
      return true;
    }

    // Mark as seen
    await this.redis.setex(key, DEDUP_TTL, '1');
    return false;
  }

  private async enrichEvent(event: NotificationEvent): Promise<EnrichedEvent> {
    // Fetch user data
    const [user] = await db.select().from(users).where(eq(users.id, event.userId)).limit(1);

    if (!user) {
      console.warn(`⚠️  User ${event.userId} not found, proceeding without enrichment`);
      return {
        ...event,
        enrichedAt: new Date().toISOString(),
      };
    }

    return {
      ...event,
      enrichedAt: new Date().toISOString(),
      userEmail: user.email,
      userPhone: user.phone || undefined,
      userPushTokens: (user.pushTokens as string[]) || [],
    };
  }

  private async publishEnrichedEvent(event: EnrichedEvent): Promise<void> {
    if (!this.js) {
      throw new Error('JetStream not initialized');
    }

    const data = new TextEncoder().encode(JSON.stringify(event));
    await this.js.publish(ENRICHED_SUBJECT, data);
    console.log(`📤 Published enriched event ${event.eventId} to ${ENRICHED_SUBJECT}`);
  }
}

// Standalone script runner
if (require.main === module) {
  const service = new IngestionService();

  process.on('SIGINT', async () => {
    await service.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await service.stop();
    process.exit(0);
  });

  service.start().catch((err) => {
    console.error('❌ Ingestion service failed:', err);
    process.exit(1);
  });
}
