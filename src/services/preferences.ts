import { JetStreamClient } from 'nats';
import { getJetStream, getJetStreamManager } from '../lib/nats';
import { getRedisClient } from '../lib/redis';
import { db } from '../lib/db';
import { notificationPreferences } from '../lib/db/schema';
import { eq, and } from 'drizzle-orm';

const ENRICHED_SUBJECT = 'notifications.enriched';
const ROUTED_SUBJECT_PREFIX = 'notifications.routed';
const RATE_LIMIT_WINDOW = 3600; // 1 hour in seconds
const DEFAULT_RATE_LIMIT = 10; // max events per user per channel per hour

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

export class PreferenceEngine {
  private js: JetStreamClient | null = null;
  private redis = getRedisClient();
  private running = false;

  async start(): Promise<void> {
    console.log('🚀 Starting Preference Engine...');

    this.js = await getJetStream();
    const jsm = await getJetStreamManager();

    // Ensure consumer exists
    try {
      await jsm.consumers.info('notifications', 'preferences-consumer');
      console.log('✅ Consumer "preferences-consumer" exists');
    } catch {
      console.log('Creating consumer "preferences-consumer"...');
      await jsm.consumers.add('notifications', {
        durable_name: 'preferences-consumer',
        ack_policy: 'explicit',
        filter_subject: ENRICHED_SUBJECT,
      });
      console.log('✅ Consumer "preferences-consumer" created');
    }

    const consumer = await this.js.consumers.get('notifications', 'preferences-consumer');
    this.running = true;

    console.log(`✅ Subscribed to ${ENRICHED_SUBJECT}`);
    console.log('🎧 Applying preferences and filters...');

    while (this.running) {
      try {
        const messages = await consumer.fetch({ max_messages: 10, expires: 5000 });
        for await (const msg of messages) {
          try {
            await this.processEvent(msg.data, msg.seq);
            msg.ack();
          } catch (error) {
            console.error('❌ Error processing event:', error);
            msg.nak();
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
    console.log('🛑 Stopping Preference Engine...');
    this.running = false;
  }

  private async processEvent(data: Uint8Array, seq: number): Promise<void> {
    const startTime = Date.now();
    const event: EnrichedEvent = JSON.parse(new TextDecoder().decode(data));

    console.log(`📩 Processing event ${event.eventId} (seq: ${seq})`);

    // Apply preferences and filters for each channel
    const allowedChannels: string[] = [];

    for (const channel of event.channels) {
      const allowed = await this.isChannelAllowed(event.userId, channel, event.eventType);
      if (allowed) {
        allowedChannels.push(channel);
      } else {
        console.log(
          `⛔ Channel ${channel} blocked for user ${event.userId} (event: ${event.eventType})`
        );
      }
    }

    if (allowedChannels.length === 0) {
      console.log(`⚠️  All channels filtered for event ${event.eventId}`);
      return;
    }

    // Publish to channel-specific subjects
    for (const channel of allowedChannels) {
      await this.publishToChannel(channel, event);
    }

    const duration = Date.now() - startTime;
    console.log(
      `✅ Processed event ${event.eventId} in ${duration}ms (${allowedChannels.length}/${event.channels.length} channels allowed)`
    );
  }

  private async isChannelAllowed(
    userId: string,
    channel: string,
    eventType: string
  ): Promise<boolean> {
    // 1. Check user preferences
    const preferences = await db
      .select()
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.userId, userId),
          eq(notificationPreferences.channel, channel),
          eq(notificationPreferences.eventType, eventType)
        )
      )
      .limit(1);

    if (preferences.length === 0) {
      // No preference set, allow by default (except marketing)
      return eventType !== 'marketing';
    }

    const pref = preferences[0];

    // 2. Check if channel is enabled
    if (!pref.enabled) {
      return false;
    }

    // 3. Check quiet hours
    if (pref.quietHoursStart && pref.quietHoursEnd) {
      const now = new Date();
      const currentTime = `${now.getUTCHours().toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')}:00`;

      if (this.isInQuietHours(currentTime, pref.quietHoursStart, pref.quietHoursEnd)) {
        console.log(`🌙 Quiet hours active for ${userId} on ${channel}`);
        return false;
      }
    }

    // 4. Check rate limiting
    const rateLimitKey = `ratelimit:${userId}:${channel}:${eventType}`;
    const currentCount = await this.redis.incr(rateLimitKey);

    if (currentCount === 1) {
      // First event in window, set expiry
      await this.redis.expire(rateLimitKey, RATE_LIMIT_WINDOW);
    }

    if (currentCount > DEFAULT_RATE_LIMIT) {
      console.log(
        `🚦 Rate limit exceeded for ${userId} on ${channel} (${currentCount}/${DEFAULT_RATE_LIMIT})`
      );
      return false;
    }

    return true;
  }

  private isInQuietHours(currentTime: string, start: string, end: string): boolean {
    // Simple time comparison (assumes UTC)
    // If end < start, quiet hours span midnight
    if (end < start) {
      return currentTime >= start || currentTime < end;
    }
    return currentTime >= start && currentTime < end;
  }

  private async publishToChannel(channel: string, event: EnrichedEvent): Promise<void> {
    if (!this.js) {
      throw new Error('JetStream not initialized');
    }

    const subject = `${ROUTED_SUBJECT_PREFIX}.${channel}`;
    const data = new TextEncoder().encode(JSON.stringify(event));
    await this.js.publish(subject, data);
    console.log(`📤 Published event ${event.eventId} to ${subject}`);
  }
}

// Standalone script runner
if (require.main === module) {
  const engine = new PreferenceEngine();

  process.on('SIGINT', async () => {
    await engine.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await engine.stop();
    process.exit(0);
  });

  engine.start().catch((err) => {
    console.error('❌ Preference engine failed:', err);
    process.exit(1);
  });
}
