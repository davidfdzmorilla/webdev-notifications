import { JetStreamClient } from 'nats';
import { getJetStream, getJetStreamManager } from '../lib/nats';
import { db } from '../lib/db';
import { notificationDeliveries } from '../lib/db/schema';
import { nanoid } from 'nanoid';

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
  private failureRate = 0; // Circuit breaker: track failure rate
  private consecutiveFailures = 0;
  private circuitOpen = false;

  async start(): Promise<void> {
    console.log('🚀 Starting Email Worker...');

    this.js = await getJetStream();
    const jsm = await getJetStreamManager();

    const consumerName = 'email-worker-consumer';
    try {
      await jsm.consumers.info('notifications', consumerName);
      console.log(`✅ Consumer "${consumerName}" exists`);
    } catch {
      console.log(`Creating consumer "${consumerName}"...`);
      await jsm.consumers.add('notifications', {
        durable_name: consumerName,
        ack_policy: 'explicit',
        filter_subject: DELIVERY_SUBJECT,
        max_deliver: MAX_RETRIES,
      });
      console.log(`✅ Consumer "${consumerName}" created`);
    }

    const consumer = await this.js.consumers.get('notifications', consumerName);
    this.running = true;

    console.log(`✅ Subscribed to ${DELIVERY_SUBJECT}`);
    console.log('📧 Delivering email notifications...');

    while (this.running) {
      // Circuit breaker: open if too many failures
      if (this.consecutiveFailures >= 5) {
        if (!this.circuitOpen) {
          console.warn('⚠️  Circuit breaker OPEN - pausing email delivery');
          this.circuitOpen = true;
        }
        await this.sleep(10000); // Wait 10s before trying again
        this.consecutiveFailures = 0; // Reset and try
        this.circuitOpen = false;
        console.log('🔄 Circuit breaker CLOSED - resuming');
      }

      try {
        const messages = await consumer.fetch({ max_messages: 5, expires: 5000 });
        for await (const msg of messages) {
          const deliveryAttempt = msg.info?.redeliveryCount || 0;
          try {
            if (deliveryAttempt > 0) {
              // Exponential backoff
              const delay = RETRY_DELAYS[Math.min(deliveryAttempt - 1, RETRY_DELAYS.length - 1)];
              console.log(`⏳ Retry delay: ${delay}ms`);
              await this.sleep(delay);
            }

            await this.deliver(msg.data, deliveryAttempt + 1, msg.seq);
            msg.ack();
            this.consecutiveFailures = 0; // Reset on success
          } catch (error) {
            this.consecutiveFailures++;
            console.error('❌ Email delivery failed:', error);
            if (deliveryAttempt + 1 >= MAX_RETRIES) {
              console.error(`⚠️  Max retries reached, moving to DLQ`);
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
        console.error('❌ Error fetching messages:', error);
      }
    }
  }

  async stop(): Promise<void> {
    console.log('🛑 Stopping Email Worker...');
    this.running = false;
  }

  private async deliver(data: Uint8Array, attempt: number, seq: number): Promise<void> {
    const startTime = Date.now();
    const notification: RenderedNotification = JSON.parse(new TextDecoder().decode(data));

    console.log(`📧 Sending email to ${notification.userEmail} (attempt ${attempt}, seq: ${seq})`);

    // Mock email sending (replace with real SMTP/SendGrid in production)
    await this.sendEmail(notification);

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

    const duration = Date.now() - startTime;
    console.log(`✅ Email sent to ${notification.userEmail} (${duration}ms)`);
  }

  private async sendEmail(notification: RenderedNotification): Promise<void> {
    // Mock SMTP send (replace with real implementation)
    // In production: use nodemailer or SendGrid API
    if (!notification.userEmail) {
      throw new Error('Missing email address');
    }

    // Simulate network delay
    await this.sleep(100);

    // Simulate 5% failure rate for testing retry logic
    if (Math.random() < 0.05) {
      throw new Error('SMTP connection timeout');
    }

    console.log(`  → To: ${notification.userEmail}`);
    console.log(`  → Subject: ${notification.subject || '(no subject)'}`);
    console.log(`  → Body: ${notification.body.substring(0, 50)}...`);
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
    console.log(`📮 Moved event ${notification.eventId} to DLQ`);

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
    console.error('❌ Email worker failed:', err);
    process.exit(1);
  });
}
