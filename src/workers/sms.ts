import { JetStreamClient } from 'nats';
import { getJetStream, getJetStreamManager } from '../lib/nats';
import { db } from '../lib/db';
import { notificationDeliveries } from '../lib/db/schema';
import { nanoid } from 'nanoid';

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
    console.log('🚀 Starting SMS Worker...');

    this.js = await getJetStream();
    const jsm = await getJetStreamManager();

    const consumerName = 'sms-worker-consumer';
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
    console.log('📱 Delivering SMS notifications...');

    while (this.running) {
      if (this.consecutiveFailures >= 5) {
        if (!this.circuitOpen) {
          console.warn('⚠️  Circuit breaker OPEN - pausing SMS delivery');
          this.circuitOpen = true;
        }
        await this.sleep(15000);
        this.consecutiveFailures = 0;
        this.circuitOpen = false;
        console.log('🔄 Circuit breaker CLOSED - resuming');
      }

      try {
        const messages = await consumer.fetch({ max_messages: 5, expires: 5000 });
        for await (const msg of messages) {
          const deliveryAttempt = msg.info?.redeliveryCount || 0;
          try {
            if (deliveryAttempt > 0) {
              const delay = RETRY_DELAYS[Math.min(deliveryAttempt - 1, RETRY_DELAYS.length - 1)];
              console.log(`⏳ Retry delay: ${delay}ms`);
              await this.sleep(delay);
            }

            await this.deliver(msg.data, deliveryAttempt + 1, msg.seq);
            msg.ack();
            this.consecutiveFailures = 0;
          } catch (error) {
            this.consecutiveFailures++;
            console.error('❌ SMS delivery failed:', error);
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
    console.log('🛑 Stopping SMS Worker...');
    this.running = false;
  }

  private async deliver(data: Uint8Array, attempt: number, seq: number): Promise<void> {
    const startTime = Date.now();
    const notification: RenderedNotification = JSON.parse(new TextDecoder().decode(data));

    console.log(`📱 Sending SMS to ${notification.userPhone} (attempt ${attempt}, seq: ${seq})`);

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

    const duration = Date.now() - startTime;
    console.log(`✅ SMS sent to ${notification.userPhone} (${duration}ms)`);
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

    console.log(`  → To: ${notification.userPhone}`);
    console.log(`  → Message: ${notification.body.substring(0, 50)}...`);
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
    console.error('❌ SMS worker failed:', err);
    process.exit(1);
  });
}
