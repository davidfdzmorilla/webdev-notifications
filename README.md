# webdev-notifications

> **Event-Driven Notification System** — Level 6 of the WebDev Progressive Roadmap

[![Live Demo](https://img.shields.io/badge/demo-notifications.davidfdzmorilla.dev-blue)](https://notifications.davidfdzmorilla.dev)
[![GitHub](https://img.shields.io/badge/github-webdev--notifications-black)](https://github.com/davidfdzmorilla/webdev-notifications)

## 🚀 Live

**[https://notifications.davidfdzmorilla.dev](https://notifications.davidfdzmorilla.dev)**

## Overview

A production-grade, event-driven notification system built with modern TypeScript stack. Supports multi-channel delivery (Email, SMS, Push, In-App) through NATS JetStream with full observability, retry logic, circuit breakers, and real-time WebSocket delivery.

## Tech Stack

| Technology                   | Purpose                               |
| ---------------------------- | ------------------------------------- |
| **Next.js 15**               | API routes, frontend, SSR             |
| **TypeScript (strict)**      | Type-safe codebase                    |
| **NATS JetStream**           | Message broker, event streaming       |
| **PostgreSQL**               | Preferences, deliveries, templates    |
| **Redis**                    | Deduplication, rate limiting, pub/sub |
| **WebSocket (Socket.IO)**    | Real-time notification delivery       |
| **Prometheus / prom-client** | Metrics & observability               |
| **Docker Compose**           | Container orchestration               |
| **Cloudflare**               | DNS, CDN, SSL termination             |
| **Nginx**                    | Reverse proxy                         |

## Architecture

```
[Client] → [Next.js API] → [NATS JetStream]
                                   ↓
                         [Ingestion Service]
                          (validate, dedup, enrich)
                                   ↓
                         [Preference Engine]
                          (check user prefs)
                                   ↓
                         [Channel Router]
                          (render templates)
                               ↙↓↘
                   [Email] [SMS] [Push] [In-App]
                     Worker  Worker  Worker  Worker
                                              ↓
                                        [WebSocket]
                                      (real-time delivery)
```

## Key Features

- ✅ **Multi-channel delivery**: Email, SMS, Push notifications, In-App
- ✅ **NATS JetStream**: Persistent messaging with at-least-once delivery
- ✅ **Deduplication**: Redis-based idempotency (1h TTL)
- ✅ **Retry logic**: Exponential backoff (1s, 5s, 15s)
- ✅ **Circuit breakers**: Auto-pause on consecutive failures
- ✅ **Dead Letter Queue**: Failed messages tracked and stored
- ✅ **Template engine**: Variable substitution per channel/event type
- ✅ **Preference engine**: User-defined channel/quiet-hours preferences
- ✅ **Real-time WebSocket**: Socket.IO with Redis pub/sub for distributed setup
- ✅ **Analytics**: Delivery tracking, stats API
- ✅ **Observability**: Prometheus metrics, structured JSON logging, health checks
- ✅ **Admin UI**: Template management dashboard
- ✅ **TypeScript strict**: Full type safety throughout

## Milestones Completed

- **M1–M3**: Project setup, Docker infrastructure, DB schema
- **M4**: NATS JetStream + ingestion service
- **M5**: Preference engine (user channel preferences, quiet hours)
- **M6**: Channel router with template rendering
- **M7**: Email worker with retry/circuit breaker
- **M8**: SMS + Push workers
- **M9**: In-App worker + WebSocket real-time delivery
- **M10**: Analytics service + delivery tracking API
- **M11**: Admin template management UI
- **M12**: Testing (unit tests, integration)
- **M13**: Observability (Prometheus metrics, structured logging, health checks)
- **M14**: Production deployment to notifications.davidfdzmorilla.dev

## API Reference

### Events

```bash
POST /api/events
X-Api-Key: your_key

{
  "eventType": "user.signup",
  "userId": "user_id",
  "channels": ["email", "in_app"],
  "priority": "high",
  "data": { "userName": "Alice", "email": "alice@example.com" }
}
```

### Health Check

```bash
GET /api/health
# Returns: { status, services: {postgres, redis, nats}, version, uptime }
```

### Prometheus Metrics

```bash
GET /api/metrics
# Returns: Prometheus text format metrics
```

### Deliveries

```bash
GET /api/deliveries              # List deliveries
GET /api/deliveries/stats        # Delivery statistics
GET /api/deliveries/:id          # Single delivery
```

### Preferences

```bash
GET  /api/preferences?userId=X   # Get user preferences
POST /api/preferences             # Create preference
PATCH /api/preferences/:id        # Update preference
```

### Templates (Admin)

```bash
GET    /api/admin/templates                    # List templates
POST   /api/admin/templates                    # Create template
PATCH  /api/admin/templates/:id               # Update template
DELETE /api/admin/templates/:id               # Delete template
```

## Running Locally

### Prerequisites

- Docker + Docker Compose
- Node.js 22+
- pnpm

### Development

```bash
git clone https://github.com/davidfdzmorilla/webdev-notifications
cd webdev-notifications

# Start infrastructure (NATS, PostgreSQL, Redis)
docker compose up -d nats postgres redis

# Install dependencies
pnpm install

# Run migrations and seed
pnpm db:push
pnpm db:seed

# Start development server
pnpm dev

# Start services (in separate terminals)
pnpm ingestion
pnpm router
pnpm worker:email
pnpm worker:sms
pnpm worker:push
pnpm worker:inapp
pnpm websocket
```

### Production

```bash
docker compose -f docker-compose.prod.yml up -d
```

### Environment Variables

```env
DATABASE_URL=postgresql://notifications:password@localhost:5437/notifications
REDIS_URL=redis://localhost:6380
NATS_URL=nats://localhost:4222
PORT=3010
API_KEY=your_api_key
ADMIN_KEY=your_admin_key
LOG_LEVEL=info
```

## Observability

### Health Check

```
GET /api/health
→ { status: 'ok'|'degraded', services: {postgres, redis, nats}, uptime }
```

### Prometheus Metrics

```
GET /api/metrics
→ events_received_total, events_processed_total, events_failed_total
→ deliveries_total{channel, status}
→ delivery_duration_seconds{channel}
→ active_websocket_connections
→ Node.js default metrics (memory, CPU, GC)
```

### Structured Logging

```json
{
  "timestamp": "2026-02-17T04:17:59.000Z",
  "level": "info",
  "service": "ingestion-service",
  "message": "Received event",
  "eventId": "abc123",
  "eventType": "user.signup"
}
```

## Testing

```bash
pnpm test              # Run unit tests
pnpm test:coverage     # With coverage
pnpm test:publish      # Publish test event to NATS
```

## License

MIT — David Fernández Morilla
