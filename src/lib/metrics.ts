/**
 * Prometheus metrics for the notification system
 */
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

// Create a global registry
export const metricsRegistry = new Registry();

// Collect default Node.js metrics (memory, CPU, etc.)
collectDefaultMetrics({ register: metricsRegistry });

// ─── Counters ────────────────────────────────────────────────────────────────

/**
 * Total events received by the ingestion service
 */
export const eventsReceivedTotal = new Counter({
  name: 'events_received_total',
  help: 'Total number of notification events received',
  labelNames: ['event_type'] as const,
  registers: [metricsRegistry],
});

/**
 * Total events successfully processed
 */
export const eventsProcessedTotal = new Counter({
  name: 'events_processed_total',
  help: 'Total number of notification events successfully processed',
  labelNames: ['event_type'] as const,
  registers: [metricsRegistry],
});

/**
 * Total events that failed processing
 */
export const eventsFailedTotal = new Counter({
  name: 'events_failed_total',
  help: 'Total number of notification events that failed processing',
  labelNames: ['event_type', 'reason'] as const,
  registers: [metricsRegistry],
});

/**
 * Total deliveries by channel and status
 */
export const deliveriesTotal = new Counter({
  name: 'deliveries_total',
  help: 'Total number of notification deliveries',
  labelNames: ['channel', 'status'] as const,
  registers: [metricsRegistry],
});

// ─── Histograms ───────────────────────────────────────────────────────────────

/**
 * Delivery duration in seconds
 */
export const deliveryDurationSeconds = new Histogram({
  name: 'delivery_duration_seconds',
  help: 'Duration of notification delivery in seconds',
  labelNames: ['channel'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

// ─── Gauges ──────────────────────────────────────────────────────────────────

/**
 * Number of active WebSocket connections
 */
export const activeWebsocketConnections = new Gauge({
  name: 'active_websocket_connections',
  help: 'Number of currently active WebSocket connections',
  registers: [metricsRegistry],
});

// ─── Helper functions ────────────────────────────────────────────────────────

/**
 * Record a delivery with timing
 */
export function recordDelivery(
  channel: string,
  status: 'delivered' | 'failed' | 'skipped',
  durationMs: number
): void {
  deliveriesTotal.inc({ channel, status });
  deliveryDurationSeconds.observe({ channel }, durationMs / 1000);
}

/**
 * Get metrics in Prometheus text format
 */
export async function getMetrics(): Promise<string> {
  return metricsRegistry.metrics();
}
