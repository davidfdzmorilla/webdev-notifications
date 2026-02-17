import { JetStreamClient, AckPolicy } from 'nats';
import { getJetStream, getJetStreamManager } from '../lib/nats';
import { db } from '../lib/db';
import { notificationDeliveries } from '../lib/db/schema';
import { nanoid } from 'nanoid';
import { createLogger } from '../lib/logger';
import { deliveriesTotal, deliveryDurationSeconds } from '../lib/metrics';

const logger = createLogger('worker:sms');

const DELIVERY_SUBJECT = 'notifications.delivery.sms';
const DLQ_SUBJECT = 'notifications.dlq';
const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 10000, 30000];

interface RenderedNotification {
  eventId: string;
  eventType: string;
  userId: string;
  channel: string;
  priority: string;
  data: Record<string, unknown>;
  body: string;
  userPhone?: string;
  renderedAt: string;
  createdAt: string;
}

export class SMSWorker {
  private js: JetStreamClient | null = null;
  private running = false;
  private consecutiveFailures = 0;
  private circuitOpen = false;

  async start(): Promise<void> {
    logger.info('Starting SMS Worker');

    this.js = await getJetStream();
    const jsm = await getJetStreamManager();

    const consumerName = 'sms-worker-consumer';
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
    logger.info('Delivering SMS notifications');

    while (this.running) {
      if (this.consecutiveFailures >= 5) {
        if (!this.circuitOpen) {
          logger.warn('Circuit breaker OPEN - pausing SMS delivery', {
            consecutiveFailures: this.consecutiveFailures,
          });
          this.circuitOpen = true;
        }
        await this.sleep(15000);
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
            logger.error('SMS delivery failed', {
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
    logger.info('Stopping SMS Worker');
    this.running = false;
  }

  private async deliver(data: Uint8Array, attempt: number, seq: number): Promise<void> {
    const startTime = Date.now();
    const notification: RenderedNotification = JSON.parse(new TextDecoder().decode(data));

    logger.info('Sending SMS', {
      to: notification.userPhone,
      attempt,
      seq,
      eventId: notification.eventId,
    });

    await this.sendSMS(notification);

    const deliveryId = nanoid();
    await db.insert(notificationDeliveries).values({
      id: deliveryId,
      eventId: notification.eventId,
      userId: notification.userId,
      channel: 'sms',
      eventType: notification.eventType,
      status: 'delivered',
      attemptCount: attempt,
      metadata: {
        to: notification.userPhone,
        sentVia: 'mock-twilio',
      },
    });

    const durationMs = Date.now() - startTime;
    deliveriesTotal.inc({ channel: 'sms', status: 'delivered' });
    deliveryDurationSeconds.observe({ channel: 'sms' }, durationMs / 1000);
    logger.info('SMS sent successfully', {
      to: notification.userPhone,
      durationMs,
      eventId: notification.eventId,
    });
  }

  private async sendSMS(notification: RenderedNotification): Promise<void> {
    // Mock Twilio API (replace with real implementation)
    if (!notification.userPhone) {
      throw new Error('Missing phone number');
    }

    await this.sleep(150);

    // Simulate 3% failure rate
    if (Math.random() < 0.03) {
      throw new Error('Twilio API error: Rate limit exceeded');
    }

    logger.debug('SMS payload', {
      to: notification.userPhone,
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
    deliveriesTotal.inc({ channel: 'sms', status: 'failed' });
    logger.warn('Event moved to DLQ', { eventId: notification.eventId });

    const deliveryId = nanoid();
    await db.insert(notificationDeliveries).values({
      id: deliveryId,
      eventId: notification.eventId,
      userId: notification.userId,
      channel: 'sms',
      eventType: notification.eventType,
      status: 'failed',
      attemptCount: MAX_RETRIES,
      error: error instanceof Error ? error.message : String(error),
      metadata: {
        to: notification.userPhone,
      },
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Standalone script runner
if (require.main === module) {
  const worker = new SMSWorker();

  process.on('SIGINT', async () => {
    await worker.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await worker.stop();
    process.exit(0);
  });

  worker.start().catch((err) => {
    logger.error('SMS worker failed', { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  });
}
