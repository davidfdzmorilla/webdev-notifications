import { JetStreamClient, AckPolicy } from 'nats';
import { getJetStream, getJetStreamManager } from '../lib/nats';
import { db } from '../lib/db';
import { notificationDeliveries } from '../lib/db/schema';
import { nanoid } from 'nanoid';
import { createLogger } from '../lib/logger';
import { deliveriesTotal, deliveryDurationSeconds } from '../lib/metrics';

const logger = createLogger('worker:push');

const DELIVERY_SUBJECT = 'notifications.delivery.push';
const DLQ_SUBJECT = 'notifications.dlq';
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 5000, 15000];

interface RenderedNotification {
  eventId: string;
  eventType: string;
  userId: string;
  channel: string;
  priority: string;
  data: Record<string, unknown>;
  subject?: string;
  body: string;
  userPushTokens?: string[];
  renderedAt: string;
  createdAt: string;
}

export class PushWorker {
  private js: JetStreamClient | null = null;
  private running = false;
  private consecutiveFailures = 0;
  private circuitOpen = false;

  async start(): Promise<void> {
    logger.info('Starting Push Worker');

    this.js = await getJetStream();
    const jsm = await getJetStreamManager();

    const consumerName = 'push-worker-consumer';
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
    logger.info('Delivering push notifications');

    while (this.running) {
      if (this.consecutiveFailures >= 5) {
        if (!this.circuitOpen) {
          logger.warn('Circuit breaker OPEN - pausing push delivery', {
            consecutiveFailures: this.consecutiveFailures,
          });
          this.circuitOpen = true;
        }
        await this.sleep(10000);
        this.consecutiveFailures = 0;
        this.circuitOpen = false;
        logger.info('Circuit breaker CLOSED - resuming');
      }

      try {
        const messages = await consumer.fetch({ max_messages: 5, expires: 5000 });
        for await (const msg of messages) {
          const deliveryAttempt = msg.info?.redeliveryCount || 0;
          try {
            if (deliveryAttempt > 0) {
              const delay = RETRY_DELAYS[Math.min(deliveryAttempt - 1, RETRY_DELAYS.length - 1)];
              logger.debug('Retry backoff', { delayMs: delay });
              await this.sleep(delay);
            }

            await this.deliver(msg.data, deliveryAttempt + 1, msg.seq);
            msg.ack();
            this.consecutiveFailures = 0;
          } catch (error) {
            this.consecutiveFailures++;
            logger.error('Push delivery failed', {
              error: error instanceof Error ? error.message : String(error),
            });
            if (deliveryAttempt + 1 >= MAX_RETRIES) {
              logger.warn('Max retries reached, moving to DLQ');
              await this.moveToDLQ(msg.data, error);
              msg.ack();
            } else {
              msg.nak();
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
    logger.info('Stopping Push Worker');
    this.running = false;
  }

  private async deliver(data: Uint8Array, attempt: number, seq: number): Promise<void> {
    const startTime = Date.now();
    const notification: RenderedNotification = JSON.parse(new TextDecoder().decode(data));

    const tokenCount = notification.userPushTokens?.length || 0;
    logger.info('Sending push notification', {
      tokenCount,
      attempt,
      seq,
      eventId: notification.eventId,
    });

    await this.sendPush(notification);

    const deliveryId = nanoid();
    await db.insert(notificationDeliveries).values({
      id: deliveryId,
      eventId: notification.eventId,
      userId: notification.userId,
      channel: 'push',
      eventType: notification.eventType,
      status: 'delivered',
      attemptCount: attempt,
      metadata: {
        deviceCount: tokenCount,
        title: notification.subject,
        sentVia: 'mock-fcm',
      },
    });

    const durationMs = Date.now() - startTime;
    deliveriesTotal.inc({ channel: 'push', status: 'delivered' });
    deliveryDurationSeconds.observe({ channel: 'push' }, durationMs / 1000);
    logger.info('Push sent successfully', {
      tokenCount,
      durationMs,
      eventId: notification.eventId,
    });
  }

  private async sendPush(notification: RenderedNotification): Promise<void> {
    // Mock FCM/APNS API (replace with real implementation)
    if (!notification.userPushTokens || notification.userPushTokens.length === 0) {
      throw new Error('No push tokens available');
    }

    await this.sleep(120);

    // Simulate 2% failure rate
    if (Math.random() < 0.02) {
      throw new Error('FCM API error: Invalid registration token');
    }

    logger.debug('Push payload', {
      devices: notification.userPushTokens.length,
      title: notification.subject,
      bodyPreview: notification.body.substring(0, 50),
    });
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
    deliveriesTotal.inc({ channel: 'push', status: 'failed' });
    logger.warn('Event moved to DLQ', { eventId: notification.eventId });

    const deliveryId = nanoid();
    await db.insert(notificationDeliveries).values({
      id: deliveryId,
      eventId: notification.eventId,
      userId: notification.userId,
      channel: 'push',
      eventType: notification.eventType,
      status: 'failed',
      attemptCount: MAX_RETRIES,
      error: error instanceof Error ? error.message : String(error),
      metadata: {
        deviceCount: notification.userPushTokens?.length || 0,
      },
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Standalone script runner
if (require.main === module) {
  const worker = new PushWorker();

  process.on('SIGINT', async () => {
    await worker.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await worker.stop();
    process.exit(0);
  });

  worker.start().catch((err) => {
    logger.error('Push worker failed', { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  });
}
