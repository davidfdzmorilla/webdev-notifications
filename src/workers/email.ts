import { JetStreamClient, AckPolicy } from 'nats';
import { getJetStream, getJetStreamManager } from '../lib/nats';
import { db } from '../lib/db';
import { notificationDeliveries } from '../lib/db/schema';
import { nanoid } from 'nanoid';
import { createLogger } from '../lib/logger';
import { deliveriesTotal, deliveryDurationSeconds } from '../lib/metrics';

const logger = createLogger('worker:email');

const DELIVERY_SUBJECT = 'notifications.delivery.email';
const DLQ_SUBJECT = 'notifications.dlq';
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 5000, 15000]; // Exponential backoff

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

export class EmailWorker {
  private js: JetStreamClient | null = null;
  private running = false;
  private consecutiveFailures = 0;
  private circuitOpen = false;

  async start(): Promise<void> {
    logger.info('Starting Email Worker');

    this.js = await getJetStream();
    const jsm = await getJetStreamManager();

    const consumerName = 'email-worker-consumer';
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
    logger.info('Delivering email notifications');

    while (this.running) {
      // Circuit breaker: open if too many failures
      if (this.consecutiveFailures >= 5) {
        if (!this.circuitOpen) {
          logger.warn('Circuit breaker OPEN - pausing email delivery', {
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
              logger.debug('Retry backoff delay', { delayMs: delay, attempt: deliveryAttempt });
              await this.sleep(delay);
            }

            await this.deliver(msg.data, deliveryAttempt + 1, msg.seq);
            msg.ack();
            this.consecutiveFailures = 0;
          } catch (error) {
            this.consecutiveFailures++;
            logger.error('Email delivery failed', {
              error: error instanceof Error ? error.message : String(error),
              attempt: deliveryAttempt + 1,
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
    logger.info('Stopping Email Worker');
    this.running = false;
  }

  private async deliver(data: Uint8Array, attempt: number, seq: number): Promise<void> {
    const startTime = Date.now();
    const notification: RenderedNotification = JSON.parse(new TextDecoder().decode(data));

    logger.info('Sending email', {
      to: notification.userEmail,
      attempt,
      seq,
      eventId: notification.eventId,
    });

    // Mock email sending
    await this.sendEmail(notification);

    const durationMs = Date.now() - startTime;

    // Track delivery
    const deliveryId = nanoid();
    await db.insert(notificationDeliveries).values({
      id: deliveryId,
      eventId: notification.eventId,
      userId: notification.userId,
      channel: 'email',
      eventType: notification.eventType,
      status: 'delivered',
      attemptCount: attempt,
      metadata: {
        to: notification.userEmail,
        subject: notification.subject,
        sentVia: 'mock-smtp',
      },
    });

    deliveriesTotal.inc({ channel: 'email', status: 'delivered' });
    deliveryDurationSeconds.observe({ channel: 'email' }, durationMs / 1000);

    logger.info('Email sent successfully', {
      to: notification.userEmail,
      durationMs,
      eventId: notification.eventId,
    });
  }

  private async sendEmail(notification: RenderedNotification): Promise<void> {
    if (!notification.userEmail) {
      throw new Error('Missing email address');
    }

    // Simulate network delay
    await this.sleep(100);

    // Simulate 5% failure rate for testing retry logic
    if (Math.random() < 0.05) {
      throw new Error('SMTP connection timeout');
    }

    logger.debug('Email payload', {
      to: notification.userEmail,
      subject: notification.subject,
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

    deliveriesTotal.inc({ channel: 'email', status: 'failed' });

    logger.warn('Event moved to DLQ', {
      eventId: notification.eventId,
      error: dlqPayload.error,
    });

    // Track failed delivery
    const deliveryId = nanoid();
    await db.insert(notificationDeliveries).values({
      id: deliveryId,
      eventId: notification.eventId,
      userId: notification.userId,
      channel: 'email',
      eventType: notification.eventType,
      status: 'failed',
      attemptCount: MAX_RETRIES,
      error: error instanceof Error ? error.message : String(error),
      metadata: {
        to: notification.userEmail,
      },
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Standalone script runner
if (require.main === module) {
  const worker = new EmailWorker();

  process.on('SIGINT', async () => {
    await worker.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await worker.stop();
    process.exit(0);
  });

  worker.start().catch((err) => {
    logger.error('Email worker failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });
}
