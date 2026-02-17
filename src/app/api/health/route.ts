import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { connect } from 'nats';

const startTime = Date.now();

interface ServiceStatus {
  status: 'ok' | 'error';
  latencyMs?: number;
  error?: string;
}

interface HealthResponse {
  status: 'ok' | 'degraded';
  services: {
    postgres: ServiceStatus;
    redis: ServiceStatus;
    nats: ServiceStatus;
  };
  version: string;
  uptime: number;
  timestamp: string;
}

async function checkPostgres(): Promise<ServiceStatus> {
  const t0 = Date.now();
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      'postgresql://notifications:notifications_dev_password@localhost:5437/notifications',
    connectionTimeoutMillis: 3000,
  });

  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    await pool.end();
    return { status: 'ok', latencyMs: Date.now() - t0 };
  } catch (err) {
    await pool.end().catch(() => {});
    return {
      status: 'error',
      latencyMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkRedis(): Promise<ServiceStatus> {
  const t0 = Date.now();
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6380';
  const redis = new Redis(redisUrl, {
    connectTimeout: 3000,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });

  try {
    await redis.connect();
    await redis.ping();
    await redis.quit();
    return { status: 'ok', latencyMs: Date.now() - t0 };
  } catch (err) {
    redis.disconnect();
    return {
      status: 'error',
      latencyMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkNats(): Promise<ServiceStatus> {
  const t0 = Date.now();
  const natsUrl = process.env.NATS_URL || 'nats://localhost:4222';

  try {
    const nc = await connect({
      servers: natsUrl,
      timeout: 3000,
    });
    await nc.flush();
    await nc.close();
    return { status: 'ok', latencyMs: Date.now() - t0 };
  } catch (err) {
    return {
      status: 'error',
      latencyMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function GET(): Promise<NextResponse<HealthResponse>> {
  const [postgres, redis, nats] = await Promise.all([checkPostgres(), checkRedis(), checkNats()]);

  const allOk = postgres.status === 'ok' && redis.status === 'ok' && nats.status === 'ok';

  const body: HealthResponse = {
    status: allOk ? 'ok' : 'degraded',
    services: { postgres, redis, nats },
    version: process.env.npm_package_version || '1.0.0',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(body, { status: allOk ? 200 : 503 });
}
