import { JetStreamClient, AckPolicy } from 'nats';
import { getJetStream, getJetStreamManager } from '../lib/nats';
import { getRedisClient } from '../lib/redis';
import { db } from '../lib/db';
import { notificationDeliveries } from '../lib/db/schema';
import { nanoid } from 'nanoid';
import { createLogger } from '../lib/logger';
import { deliveriesTotal, deliveryDurationSeconds } from '../lib/metrics';

const logger = createLogger('worker:in-app');

const DELIVERY_SUBJECT = 'notifications.delivery.in_app';
const DLQ_SUBJECT = 'notifications.dlq';
const MAX_RETRIES = 3;

interface RenderedNotification {
  eventId: string;
  eventType: string;
  userId: string;
  channel: string;
  priority: string;
  data: Record<string, unknown>;
  subject?: string;
  body: string;
  userEmail?: string;
  renderedAt: string;
  createdAt: string;
}

export class InAppWorker {
  private js: JetStreamClient | null = null;
  private redis = getRedisClient();
  private running = false;

  async start(): Promise<void> {
    logger.info('Starting In-App Worker');

    this.js = await getJetStream();
    const jsm = await getJetStreamManager();

    // Ensure consumer exists
    const consumerName = 'inapp-worker-consumer';
    try {
      await jsm.consumers.info('notifications', consumerName);
      logger.info('Consumer exists', { consumerName });
    } catch {
      logger.info('Creating consumer', { consumerName });
      await jsm.consumers.add('notifications', {
        durable_name: consumerName,
        ack_policy: AckPolicy.Explicit,
        filter_subject: DELIVERY_SUBJECT,
        max_deliver: MAX_RETRIES,
      });
      logger.info('Consumer created', { consumerName });
    }

    const consumer = await this.js.consumers.get('notifications', consumerName);
    this.running = true;

    logger.info('Subscribed to delivery subject', { subject: DELIVERY_SUBJECT });
    logger.info('Delivering in-app notifications');

    while (this.running) {
      try {
        const messages = await consumer.fetch({ max_messages: 10, expires: 5000 });
        for await (const msg of messages) {
          const deliveryAttempt = msg.info?.redeliveryCount || 0;
          try {
            await this.deliver(msg.data, deliveryAttempt + 1, msg.seq);
            msg.ack();
          } catch (error) {
            logger.error('Delivery failed', {
              error: error instanceof Error ? error.message : String(error),
            });
            if (deliveryAttempt + 1 >= MAX_RETRIES) {
              logger.warn('Max retries reached, moving to DLQ');
              await this.moveToDLQ(msg.data, error);
              msg.ack(); // Ack to remove from main queue
            } else {
              msg.nak(); // Requeue for retry
            }
          }
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('timeout')) {
          continue;
        }
        logger.error('Error fetching messages', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  async stop(): Promise<void> {
    logger.info('Stopping In-App Worker');
    this.running = false;
  }

  private async deliver(data: Uint8Array, attempt: number, seq: number): Promise<void> {
    const startTime = Date.now();
    const notification: RenderedNotification = JSON.parse(new TextDecoder().decode(data));

    logger.info('Delivering in-app notification', { eventId: notification.eventId, attempt, seq });

    // Store in database (in-app notifications are stored for user to view later)
    const deliveryId = nanoid();

    await db.insert(notificationDeliveries).values({
      id: deliveryId,
      eventId: notification.eventId,
      userId: notification.userId,
      channel: 'in_app',
      eventType: notification.eventType,
      status: 'delivered',
      attemptCount: attempt,
      metadata: {
        subject: notification.subject,
        body: notification.body,
        priority: notification.priority,
      },
    });

    // Broadcast to WebSocket clients via Redis pub/sub
    await this.redis.publish(
      'ws:notifications',
      JSON.stringify({
        userId: notification.userId,
        notification: {
          id: deliveryId,
          eventId: notification.eventId,
          eventType: notification.eventType,
          subject: notification.subject,
          body: notification.body,
          priority: notification.priority,
          createdAt: notification.createdAt,
        },
      })
    );

    const durationMs = Date.now() - startTime;
    deliveriesTotal.inc({ channel: 'in_app', status: 'delivered' });
    deliveryDurationSeconds.observe({ channel: 'in_app' }, durationMs / 1000);
    logger.info('In-app notification delivered', { eventId: notification.eventId, durationMs });
  }

  private async moveToDLQ(data: Uint8Array, error: unknown): Promise<void> {
    if (!this.js) {
      return;
    }

    const notification: RenderedNotification = JSON.parse(new TextDecoder().decode(data));
    const dlqPayload = {
      ...notification,
      error: error instanceof Error ? error.message : String(error),
      movedToDlqAt: new Date().toISOString(),
    };

    await this.js.publish(DLQ_SUBJECT, new TextEncoder().encode(JSON.stringify(dlqPayload)));
    deliveriesTotal.inc({ channel: 'in_app', status: 'failed' });
    logger.warn('Event moved to DLQ', { eventId: notification.eventId });
  }
}

// Standalone script runner
if (require.main === module) {
  const worker = new InAppWorker();

  process.on('SIGINT', async () => {
    await worker.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await worker.stop();
    process.exit(0);
  });

  worker.start().catch((err) => {
    logger.error('In-app worker failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });
}
