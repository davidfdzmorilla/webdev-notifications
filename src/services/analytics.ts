import { db } from '../lib/db';
import { notificationDeliveries } from '../lib/db/schema';
import { sql, eq, gte } from 'drizzle-orm';

interface ChannelMetrics {
  channel: string;
  total: number;
  delivered: number;
  failed: number;
  successRate: number;
  avgAttempts: number;
}

interface DeliveryAnalytics {
  period: string;
  totalDeliveries: number;
  successRate: number;
  channelMetrics: ChannelMetrics[];
  topEventTypes: { eventType: string; count: number }[];
  avgLatency?: number;
}

export class AnalyticsService {
  /**
   * Get delivery analytics for a time period
   */
  async getAnalytics(periodHours = 24): Promise<DeliveryAnalytics> {
    const since = new Date(Date.now() - periodHours * 60 * 60 * 1000);

    // Overall metrics
    const [totalStats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        delivered: sql<number>`count(case when status = 'delivered' then 1 end)::int`,
        failed: sql<number>`count(case when status = 'failed' then 1 end)::int`,
      })
      .from(notificationDeliveries)
      .where(gte(notificationDeliveries.createdAt, since));

    const successRate = totalStats.total > 0 ? (totalStats.delivered / totalStats.total) * 100 : 0;

    // Channel metrics
    const channelStats = await db
      .select({
        channel: notificationDeliveries.channel,
        total: sql<number>`count(*)::int`,
        delivered: sql<number>`count(case when status = 'delivered' then 1 end)::int`,
        failed: sql<number>`count(case when status = 'failed' then 1 end)::int`,
        avgAttempts: sql<number>`avg(attempt_count)::float`,
      })
      .from(notificationDeliveries)
      .where(gte(notificationDeliveries.createdAt, since))
      .groupBy(notificationDeliveries.channel);

    const channelMetrics: ChannelMetrics[] = channelStats.map((stat) => ({
      channel: stat.channel,
      total: stat.total,
      delivered: stat.delivered,
      failed: stat.failed,
      successRate: stat.total > 0 ? (stat.delivered / stat.total) * 100 : 0,
      avgAttempts: Math.round(stat.avgAttempts * 100) / 100,
    }));

    // Top event types
    const topEvents = await db
      .select({
        eventType: notificationDeliveries.eventType,
        count: sql<number>`count(*)::int`,
      })
      .from(notificationDeliveries)
      .where(gte(notificationDeliveries.createdAt, since))
      .groupBy(notificationDeliveries.eventType)
      .orderBy(sql`count(*) desc`)
      .limit(10);

    return {
      period: `${periodHours}h`,
      totalDeliveries: totalStats.total,
      successRate: Math.round(successRate * 100) / 100,
      channelMetrics,
      topEventTypes: topEvents,
    };
  }

  /**
   * Get delivery history for a specific user
   */
  async getUserDeliveries(userId: string, limit = 50) {
    return await db
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.userId, userId))
      .orderBy(sql`created_at desc`)
      .limit(limit);
  }

  /**
   * Get delivery details by ID
   */
  async getDeliveryById(deliveryId: string) {
    const [delivery] = await db
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.id, deliveryId))
      .limit(1);

    return delivery;
  }

  /**
   * Get failed deliveries for retry
   */
  async getFailedDeliveries(limit = 100) {
    return await db
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.status, 'failed'))
      .orderBy(sql`created_at desc`)
      .limit(limit);
  }

  /**
   * Get deliveries by event ID (for debugging/tracking)
   */
  async getDeliveriesByEventId(eventId: string) {
    return await db
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.eventId, eventId))
      .orderBy(sql`created_at asc`);
  }

  /**
   * Get real-time metrics summary
   */
  async getMetricsSummary() {
    const last1h = await this.getAnalytics(1);
    const last24h = await this.getAnalytics(24);
    const last7d = await this.getAnalytics(24 * 7);

    return {
      last1h,
      last24h,
      last7d,
    };
  }

  /**
   * Print analytics to console (for CLI/monitoring)
   */
  async printAnalytics(periodHours = 24): Promise<void> {
    const analytics = await this.getAnalytics(periodHours);

    console.log('\n📊 Delivery Analytics');
    console.log('═'.repeat(60));
    console.log(`Period: Last ${analytics.period}`);
    console.log(`Total Deliveries: ${analytics.totalDeliveries}`);
    console.log(`Success Rate: ${analytics.successRate.toFixed(2)}%`);
    console.log();

    console.log('📈 Channel Breakdown:');
    console.log('─'.repeat(60));
    analytics.channelMetrics.forEach((channel) => {
      console.log(`  ${channel.channel.toUpperCase()}`);
      console.log(`    Total: ${channel.total}`);
      console.log(`    Delivered: ${channel.delivered} (${channel.successRate.toFixed(1)}%)`);
      console.log(`    Failed: ${channel.failed}`);
      console.log(`    Avg Attempts: ${channel.avgAttempts}`);
    });
    console.log();

    if (analytics.topEventTypes.length > 0) {
      console.log('🔥 Top Event Types:');
      console.log('─'.repeat(60));
      analytics.topEventTypes.forEach((event, idx) => {
        console.log(`  ${idx + 1}. ${event.eventType}: ${event.count}`);
      });
    }
    console.log('═'.repeat(60));
  }
}

// CLI runner
if (require.main === module) {
  const analytics = new AnalyticsService();

  const args = process.argv.slice(2);
  const hours = args[0] ? parseInt(args[0], 10) : 24;

  analytics
    .printAnalytics(hours)
    .then(() => {
      console.log('✅ Analytics complete');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Analytics failed:', err);
      process.exit(1);
    });
}
