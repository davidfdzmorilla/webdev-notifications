import { AnalyticsService } from '../services/analytics';
import { getRedisClient } from '../lib/redis';
import { getNatsConnection } from '../lib/nats';
import { db } from '../lib/db';

const REFRESH_INTERVAL = 10000; // 10 seconds

interface SystemHealth {
  status: 'healthy' | 'degraded' | 'down';
  components: {
    database: boolean;
    redis: boolean;
    nats: boolean;
  };
  timestamp: string;
}

async function checkHealth(): Promise<SystemHealth> {
  const health: SystemHealth = {
    status: 'healthy',
    components: {
      database: false,
      redis: false,
      nats: false,
    },
    timestamp: new Date().toISOString(),
  };

  // Check database
  try {
    await db.execute(sql`SELECT 1`);
    health.components.database = true;
  } catch {
    health.components.database = false;
  }

  // Check Redis
  try {
    const redis = getRedisClient();
    await redis.ping();
    health.components.redis = true;
  } catch {
    health.components.redis = false;
  }

  // Check NATS
  try {
    const nc = await getNatsConnection();
    if (nc.isClosed()) {
      health.components.nats = false;
    } else {
      health.components.nats = true;
    }
  } catch {
    health.components.nats = false;
  }

  // Determine overall status
  const componentCount = Object.values(health.components).filter(Boolean).length;
  if (componentCount === 3) {
    health.status = 'healthy';
  } else if (componentCount >= 2) {
    health.status = 'degraded';
  } else {
    health.status = 'down';
  }

  return health;
}

async function printStatus() {
  console.clear();
  console.log('═'.repeat(70));
  console.log('🔍 NOTIFICATION SYSTEM MONITOR');
  console.log('═'.repeat(70));
  console.log();

  // Health check
  const health = await checkHealth();
  const statusIcon =
    health.status === 'healthy' ? '✅' : health.status === 'degraded' ? '⚠️' : '❌';
  console.log(`${statusIcon} System Status: ${health.status.toUpperCase()}`);
  console.log(`  Database: ${health.components.database ? '✅' : '❌'}`);
  console.log(`  Redis: ${health.components.redis ? '✅' : '❌'}`);
  console.log(`  NATS: ${health.components.nats ? '✅' : '❌'}`);
  console.log();

  // Analytics
  const analytics = new AnalyticsService();
  const summary = await analytics.getMetricsSummary();

  console.log('📊 Last 1 Hour');
  console.log('─'.repeat(70));
  console.log(
    `  Total: ${summary.last1h.totalDeliveries} | Success: ${summary.last1h.successRate.toFixed(1)}%`
  );
  summary.last1h.channelMetrics.forEach((ch) => {
    console.log(`    ${ch.channel}: ${ch.delivered}/${ch.total} (${ch.successRate.toFixed(1)}%)`);
  });
  console.log();

  console.log('📊 Last 24 Hours');
  console.log('─'.repeat(70));
  console.log(
    `  Total: ${summary.last24h.totalDeliveries} | Success: ${summary.last24h.successRate.toFixed(1)}%`
  );
  summary.last24h.channelMetrics.forEach((ch) => {
    console.log(`    ${ch.channel}: ${ch.delivered}/${ch.total} (${ch.successRate.toFixed(1)}%)`);
  });
  console.log();

  console.log('🔥 Top Event Types (24h)');
  console.log('─'.repeat(70));
  summary.last24h.topEventTypes.slice(0, 5).forEach((event, idx) => {
    console.log(`  ${idx + 1}. ${event.eventType}: ${event.count}`);
  });

  console.log();
  console.log('═'.repeat(70));
  console.log(`Last updated: ${new Date().toLocaleTimeString()} (refreshes every 10s)`);
  console.log('Press Ctrl+C to exit');
}

// Import sql for health check
import { sql } from 'drizzle-orm';

async function main() {
  console.log('🚀 Starting notification system monitor...\n');

  // Initial display
  await printStatus();

  // Refresh every 10 seconds
  const interval = setInterval(async () => {
    try {
      await printStatus();
    } catch (error) {
      console.error('Error refreshing status:', error);
    }
  }, REFRESH_INTERVAL);

  // Cleanup on exit
  process.on('SIGINT', () => {
    clearInterval(interval);
    console.log('\n\n👋 Monitor stopped');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    clearInterval(interval);
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('❌ Monitor failed:', err);
  process.exit(1);
});
