import { JetStreamClient } from 'nats';
import { getJetStream, getJetStreamManager } from '../lib/nats';
import { db } from '../lib/db';
import { notificationDeliveries } from '../lib/db/schema';
import { nanoid } from 'nanoid';

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
  private running = false;

  async start(): Promise<void> {
    console.log('🚀 Starting In-App Worker...');

    this.js = await getJetStream();
    const jsm = await getJetStreamManager();

    // Ensure consumer exists
    const consumerName = 'inapp-worker-consumer';
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
    console.log('📱 Delivering in-app notifications...');

    while (this.running) {
      try {
        const messages = await consumer.fetch({ max_messages: 10, expires: 5000 });
        for await (const msg of messages) {
          const deliveryAttempt = msg.info?.redeliveryCount || 0;
          try {
            await this.deliver(msg.data, deliveryAttempt + 1, msg.seq);
            msg.ack();
          } catch (error) {
            console.error('❌ Delivery failed:', error);
            if (deliveryAttempt + 1 >= MAX_RETRIES) {
              console.error(`⚠️  Max retries reached, moving to DLQ`);
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
        console.error('❌ Error fetching messages:', error);
      }
    }
  }

  async stop(): Promise<void> {
    console.log('🛑 Stopping In-App Worker...');
    this.running = false;
  }

  private async deliver(data: Uint8Array, attempt: number, seq: number): Promise<void> {
    const startTime = Date.now();
    const notification: RenderedNotification = JSON.parse(new TextDecoder().decode(data));

    console.log(
      `📱 Delivering in-app notification ${notification.eventId} (attempt ${attempt}, seq: ${seq})`
    );

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

    // TODO: Broadcast to WebSocket clients (future enhancement)
    // For now, just store in DB

    const duration = Date.now() - startTime;
    console.log(`✅ In-app notification ${notification.eventId} stored (${duration}ms)`);
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
    console.error('❌ In-app worker failed:', err);
    process.exit(1);
  });
}
