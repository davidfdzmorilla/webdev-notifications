import { JetStreamClient } from 'nats';
import { getJetStream, getJetStreamManager } from '../lib/nats';
import { db } from '../lib/db';
import { notificationDeliveries } from '../lib/db/schema';
import { nanoid } from 'nanoid';

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
    console.log('🚀 Starting Push Worker...');

    this.js = await getJetStream();
    const jsm = await getJetStreamManager();

    const consumerName = 'push-worker-consumer';
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
    console.log('🔔 Delivering push notifications...');

    while (this.running) {
      if (this.consecutiveFailures >= 5) {
        if (!this.circuitOpen) {
          console.warn('⚠️  Circuit breaker OPEN - pausing push delivery');
          this.circuitOpen = true;
        }
        await this.sleep(10000);
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
            console.error('❌ Push delivery failed:', error);
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
    console.log('🛑 Stopping Push Worker...');
    this.running = false;
  }

  private async deliver(data: Uint8Array, attempt: number, seq: number): Promise<void> {
    const startTime = Date.now();
    const notification: RenderedNotification = JSON.parse(new TextDecoder().decode(data));

    const tokenCount = notification.userPushTokens?.length || 0;
    console.log(`🔔 Sending push to ${tokenCount} device(s) (attempt ${attempt}, seq: ${seq})`);

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

    const duration = Date.now() - startTime;
    console.log(`✅ Push sent to ${tokenCount} device(s) (${duration}ms)`);
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

    console.log(`  → Devices: ${notification.userPushTokens.length}`);
    console.log(`  → Title: ${notification.subject || '(no title)'}`);
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
    console.error('❌ Push worker failed:', err);
    process.exit(1);
  });
}
