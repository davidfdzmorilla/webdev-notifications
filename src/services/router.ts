import { JetStreamClient, AckPolicy } from 'nats';
import { getJetStream, getJetStreamManager } from '../lib/nats';
import { db } from '../lib/db';
import { notificationTemplates } from '../lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { createLogger } from '../lib/logger';
import { eventsProcessedTotal, eventsFailedTotal } from '../lib/metrics';

const logger = createLogger('channel-router');

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
    logger.info('Starting Channel Router');

    this.js = await getJetStream();
    const jsm = await getJetStreamManager();

    // Create consumers for each channel
    for (const subject of ROUTED_SUBJECTS) {
      const channel = subject.split('.').pop() || '';
      const consumerName = `router-${channel}-consumer`;

      try {
        await jsm.consumers.info('notifications', consumerName);
        logger.info('Consumer exists', { consumerName });
      } catch {
        logger.info('Creating consumer', { consumerName });
        await jsm.consumers.add('notifications', {
          durable_name: consumerName,
          ack_policy: AckPolicy.Explicit,
          filter_subject: subject,
        });
        logger.info('Consumer created', { consumerName });
      }
    }

    this.running = true;
    logger.info('Routing and rendering notifications');

    // Process each channel in parallel
    const processors = ROUTED_SUBJECTS.map((subject) => this.processChannel(subject));
    await Promise.all(processors);
  }

  async stop(): Promise<void> {
    logger.info('Stopping Channel Router');
    this.running = false;
  }

  private async processChannel(subject: string): Promise<void> {
    const channel = subject.split('.').pop() || '';
    const consumerName = `router-${channel}-consumer`;

    if (!this.js) {
      throw new Error('JetStream not initialized');
    }

    const consumer = await this.js.consumers.get('notifications', consumerName);
    const channelLogger = logger.child(channel);

    while (this.running) {
      try {
        const messages = await consumer.fetch({ max_messages: 5, expires: 5000 });
        for await (const msg of messages) {
          try {
            await this.processEvent(msg.data, channel, msg.seq);
            msg.ack();
          } catch (error) {
            channelLogger.error('Error processing event', {
              seq: msg.seq,
              error: error instanceof Error ? error.message : String(error),
            });
            eventsFailedTotal.inc({ event_type: 'unknown', reason: 'routing' });
            msg.nak();
          }
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('timeout')) {
          continue;
        }
        channelLogger.error('Error fetching messages', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async processEvent(data: Uint8Array, channel: string, seq: number): Promise<void> {
    const startTime = Date.now();
    const event: EnrichedEvent = JSON.parse(new TextDecoder().decode(data));
    const channelLogger = logger.child(channel);

    channelLogger.info('Routing notification', {
      eventId: event.eventId,
      seq,
      eventType: event.eventType,
    });

    // Fetch template
    const template = await this.fetchTemplate(channel, event.eventType);
    if (!template) {
      channelLogger.warn('No template found, using fallback', {
        channel,
        eventType: event.eventType,
      });
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
    eventsProcessedTotal.inc({ event_type: event.eventType });
    channelLogger.info('Notification routed', {
      eventId: event.eventId,
      durationMs: duration,
    });
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
    const context = {
      ...event.data,
      userName: event.data.userName || event.userEmail?.split('@')[0] || 'User',
      userEmail: event.userEmail,
    };

    let renderedBody = template.body;
    let renderedSubject = template.subject;

    for (const variable of template.variables) {
      const value = context[variable as keyof typeof context];
      const placeholder = new RegExp(`\\{\\{${variable}\\}\\}`, 'g');
      renderedBody = renderedBody.replace(placeholder, String(value || ''));
    }

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

    const subject = `notifications.delivery.${channel}`;
    const data = new TextEncoder().encode(JSON.stringify(notification));
    await this.js.publish(subject, data);
    logger.debug('Published rendered notification', {
      channel,
      eventId: notification.eventId,
      subject,
    });
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
    logger.error('Channel router failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });
}
