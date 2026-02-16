import { JetStreamClient } from 'nats';
import { getJetStream, getJetStreamManager } from '../lib/nats';
import { db } from '../lib/db';
import { notificationTemplates } from '../lib/db/schema';
import { eq, and } from 'drizzle-orm';

const ROUTED_SUBJECTS = [
  'notifications.routed.email',
  'notifications.routed.sms',
  'notifications.routed.push',
  'notifications.routed.in_app',
];

interface EnrichedEvent {
  eventId: string;
  eventType: string;
  userId: string;
  channels: string[];
  priority: string;
  data: Record<string, unknown>;
  enrichedAt: string;
  userEmail?: string;
  userPhone?: string;
  userPushTokens?: string[];
  scheduledAt?: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

interface RenderedNotification extends EnrichedEvent {
  channel: string;
  subject?: string;
  body: string;
  renderedAt: string;
}

export class ChannelRouter {
  private js: JetStreamClient | null = null;
  private running = false;

  async start(): Promise<void> {
    console.log('🚀 Starting Channel Router...');

    this.js = await getJetStream();
    const jsm = await getJetStreamManager();

    // Create consumers for each channel
    for (const subject of ROUTED_SUBJECTS) {
      const channel = subject.split('.').pop() || '';
      const consumerName = `router-${channel}-consumer`;

      try {
        await jsm.consumers.info('notifications', consumerName);
        console.log(`✅ Consumer "${consumerName}" exists`);
      } catch {
        console.log(`Creating consumer "${consumerName}"...`);
        await jsm.consumers.add('notifications', {
          durable_name: consumerName,
          ack_policy: 'explicit',
          filter_subject: subject,
        });
        console.log(`✅ Consumer "${consumerName}" created`);
      }
    }

    this.running = true;
    console.log('🎧 Routing and rendering notifications...');

    // Process each channel in parallel
    const processors = ROUTED_SUBJECTS.map((subject) => this.processChannel(subject));
    await Promise.all(processors);
  }

  async stop(): Promise<void> {
    console.log('🛑 Stopping Channel Router...');
    this.running = false;
  }

  private async processChannel(subject: string): Promise<void> {
    const channel = subject.split('.').pop() || '';
    const consumerName = `router-${channel}-consumer`;

    if (!this.js) {
      throw new Error('JetStream not initialized');
    }

    const consumer = await this.js.consumers.get('notifications', consumerName);

    while (this.running) {
      try {
        const messages = await consumer.fetch({ max_messages: 5, expires: 5000 });
        for await (const msg of messages) {
          try {
            await this.processEvent(msg.data, channel, msg.seq);
            msg.ack();
          } catch (error) {
            console.error(`❌ Error processing ${channel} event:`, error);
            msg.nak();
          }
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('timeout')) {
          continue;
        }
        console.error(`❌ Error fetching ${channel} messages:`, error);
      }
    }
  }

  private async processEvent(data: Uint8Array, channel: string, seq: number): Promise<void> {
    const startTime = Date.now();
    const event: EnrichedEvent = JSON.parse(new TextDecoder().decode(data));

    console.log(`📩 Routing ${channel} notification for event ${event.eventId} (seq: ${seq})`);

    // Fetch template
    const template = await this.fetchTemplate(channel, event.eventType);
    if (!template) {
      console.warn(`⚠️  No template found for ${channel}/${event.eventType}, using fallback`);
      // Use fallback template
      await this.publishRendered(channel, {
        ...event,
        channel,
        subject: `Notification: ${event.eventType}`,
        body: JSON.stringify(event.data),
        renderedAt: new Date().toISOString(),
      });
      return;
    }

    // Render template
    const rendered = this.renderTemplate(template, event);

    // Publish rendered notification
    await this.publishRendered(channel, {
      ...event,
      channel,
      subject: rendered.subject,
      body: rendered.body,
      renderedAt: new Date().toISOString(),
    });

    const duration = Date.now() - startTime;
    console.log(`✅ Routed ${channel} notification ${event.eventId} in ${duration}ms`);
  }

  private async fetchTemplate(
    channel: string,
    eventType: string
  ): Promise<{ subject?: string; body: string; variables: string[] } | null> {
    const [template] = await db
      .select()
      .from(notificationTemplates)
      .where(
        and(
          eq(notificationTemplates.channel, channel),
          eq(notificationTemplates.eventType, eventType)
        )
      )
      .limit(1);

    if (!template) {
      return null;
    }

    return {
      subject: template.subject || undefined,
      body: template.body,
      variables: (template.variables as string[]) || [],
    };
  }

  private renderTemplate(
    template: { subject?: string; body: string; variables: string[] },
    event: EnrichedEvent
  ): { subject?: string; body: string } {
    // Simple variable substitution: {{variableName}} → event.data[variableName]
    const context = {
      ...event.data,
      userName: event.data.userName || event.userEmail?.split('@')[0] || 'User',
      userEmail: event.userEmail,
    };

    let renderedBody = template.body;
    let renderedSubject = template.subject;

    // Replace variables in body
    for (const variable of template.variables) {
      const value = context[variable as keyof typeof context];
      const placeholder = new RegExp(`\\{\\{${variable}\\}\\}`, 'g');
      renderedBody = renderedBody.replace(placeholder, String(value || ''));
    }

    // Replace variables in subject
    if (renderedSubject) {
      for (const variable of template.variables) {
        const value = context[variable as keyof typeof context];
        const placeholder = new RegExp(`\\{\\{${variable}\\}\\}`, 'g');
        renderedSubject = renderedSubject.replace(placeholder, String(value || ''));
      }
    }

    return {
      subject: renderedSubject,
      body: renderedBody,
    };
  }

  private async publishRendered(
    channel: string,
    notification: RenderedNotification
  ): Promise<void> {
    if (!this.js) {
      throw new Error('JetStream not initialized');
    }

    // Publish to delivery subject for workers
    const subject = `notifications.delivery.${channel}`;
    const data = new TextEncoder().encode(JSON.stringify(notification));
    await this.js.publish(subject, data);
    console.log(
      `📤 Published rendered ${channel} notification ${notification.eventId} to ${subject}`
    );
  }
}

// Standalone script runner
if (require.main === module) {
  const router = new ChannelRouter();

  process.on('SIGINT', async () => {
    await router.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await router.stop();
    process.exit(0);
  });

  router.start().catch((err) => {
    console.error('❌ Channel router failed:', err);
    process.exit(1);
  });
}
