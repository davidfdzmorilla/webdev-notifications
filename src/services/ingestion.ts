import { JetStreamClient, RetentionPolicy, StorageType, AckPolicy } from 'nats';
import { getJetStream, getJetStreamManager } from '../lib/nats';
import { getRedisClient } from '../lib/redis';
import { db } from '../lib/db';
import { users } from '../lib/db/schema';
import { eq } from 'drizzle-orm';
import { notificationEventSchema, type NotificationEvent } from '../types';
import { createLogger } from '../lib/logger';
import { eventsReceivedTotal, eventsProcessedTotal, eventsFailedTotal } from '../lib/metrics';

const logger = createLogger('ingestion-service');

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
    logger.info('Starting Ingestion Service');

    // Initialize NATS JetStream
    this.js = await getJetStream();
    const jsm = await getJetStreamManager();

    // Ensure stream exists
    try {
      await jsm.streams.info('notifications');
      logger.info('Stream "notifications" exists');
    } catch {
      logger.info('Creating stream "notifications"');
      await jsm.streams.add({
        name: 'notifications',
        subjects: ['notifications.>'],
        retention: RetentionPolicy.Limits,
        max_age: 86400_000_000_000, // 24 hours in nanoseconds
        storage: StorageType.File,
      });
      logger.info('Stream "notifications" created');
    }

    // Ensure consumer exists
    try {
      await jsm.consumers.info('notifications', 'ingestion-consumer');
      logger.info('Consumer "ingestion-consumer" exists');
    } catch {
      logger.info('Creating consumer "ingestion-consumer"');
      await jsm.consumers.add('notifications', {
        durable_name: 'ingestion-consumer',
        ack_policy: AckPolicy.Explicit,
        filter_subject: EVENTS_SUBJECT,
      });
      logger.info('Consumer "ingestion-consumer" created');
    }

    // Subscribe to events using pull consumer
    const consumer = await this.js.consumers.get('notifications', 'ingestion-consumer');
    this.running = true;

    logger.info('Subscribed to events subject', { subject: EVENTS_SUBJECT });
    logger.info('Listening for events');

    // Process messages
    while (this.running) {
      try {
        const messages = await consumer.fetch({ max_messages: 10, expires: 5000 });
        for await (const msg of messages) {
          try {
            await this.processEvent(msg.data, msg.seq);
            msg.ack();
          } catch (error) {
            logger.error('Error processing event', {
              seq: msg.seq,
              error: error instanceof Error ? error.message : String(error),
            });
            msg.nak();
          }
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('timeout')) {
          // No messages available, continue
          continue;
        }
        logger.error('Error fetching messages', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  async stop(): Promise<void> {
    logger.info('Stopping Ingestion Service');
    this.running = false;
  }

  private async processEvent(data: Uint8Array, seq: number): Promise<void> {
    const startTime = Date.now();

    // Parse and validate event
    const rawEvent = JSON.parse(new TextDecoder().decode(data));
    const validationResult = notificationEventSchema.safeParse(rawEvent);

    if (!validationResult.success) {
      logger.error('Invalid event schema', {
        seq,
        errors: validationResult.error.flatten(),
      });
      eventsFailedTotal.inc({ event_type: rawEvent?.eventType || 'unknown', reason: 'validation' });
      throw new Error('Invalid event schema');
    }

    const event = validationResult.data;
    eventsReceivedTotal.inc({ event_type: event.eventType });
    logger.info('Received event', { eventId: event.eventId, seq, eventType: event.eventType });

    // Check for duplicates
    const isDuplicate = await this.checkDuplicate(event.eventId);
    if (isDuplicate) {
      logger.warn('Duplicate event detected, skipping', { eventId: event.eventId });
      return;
    }

    // Enrich event with user data
    const enrichedEvent = await this.enrichEvent(event);

    // Publish enriched event
    await this.publishEnrichedEvent(enrichedEvent);

    const duration = Date.now() - startTime;
    eventsProcessedTotal.inc({ event_type: event.eventType });
    logger.info('Event processed successfully', {
      eventId: event.eventId,
      durationMs: duration,
    });
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
      logger.warn('User not found, proceeding without enrichment', { userId: event.userId });
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
    logger.debug('Published enriched event', {
      eventId: event.eventId,
      subject: ENRICHED_SUBJECT,
    });
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
    logger.error('Ingestion service failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });
}
