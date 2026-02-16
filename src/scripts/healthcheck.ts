#!/usr/bin/env tsx
import { db } from '../lib/db';
import { getNatsConnection, closeNatsConnection } from '../lib/nats';
import { getRedisClient, closeRedisConnection } from '../lib/redis';
import { sql } from 'drizzle-orm';

async function checkDatabase() {
  try {
    await db.execute(sql`SELECT 1`);
    console.log('✅ Database connection OK');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}

async function checkNATS() {
  try {
    const nc = await getNatsConnection();
    const status = nc.status();
    console.log(`✅ NATS connection OK (status: ${status})`);
    return true;
  } catch (error) {
    console.error('❌ NATS connection failed:', error);
    return false;
  }
}

async function checkRedis() {
  try {
    const redis = getRedisClient();
    const pong = await redis.ping();
    console.log(`✅ Redis connection OK (${pong})`);
    return true;
  } catch (error) {
    console.error('❌ Redis connection failed:', error);
    return false;
  }
}

async function main() {
  console.log('🔍 Running health checks...\n');

  const [dbOk, natsOk, redisOk] = await Promise.all([checkDatabase(), checkNATS(), checkRedis()]);

  await closeNatsConnection();
  await closeRedisConnection();

  console.log('\n📊 Health Check Summary:');
  console.log(`  Database: ${dbOk ? '✅' : '❌'}`);
  console.log(`  NATS: ${natsOk ? '✅' : '❌'}`);
  console.log(`  Redis: ${redisOk ? '✅' : '❌'}`);

  if (dbOk && natsOk && redisOk) {
    console.log('\n✅ All systems operational!');
    process.exit(0);
  } else {
    console.log('\n❌ Some systems are down. Please check the logs.');
    process.exit(1);
  }
}

main();
