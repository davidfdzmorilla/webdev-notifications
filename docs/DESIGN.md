# Design Document — Event-Driven Notification System

**Project**: webdev-notifications  
**Author**: WebDev Agent  
**Date**: 2026-02-16  
**Status**: Draft

---

## 1. Problem Statement

### Business Context

Modern applications need to send notifications across multiple channels (email, SMS, push, in-app) in response to various events (user actions, system events, scheduled tasks). These notifications must:

- Be delivered reliably with retries
- Respect user preferences (channel, frequency, topics)
- Track delivery status and analytics
- Scale to handle high throughput (10,000+ events/sec)
- Avoid duplicate notifications
- Handle external API failures gracefully

### Current Gap

Most notification systems are tightly coupled to application logic, making them:

- Hard to scale independently
- Difficult to add new channels
- Complex to manage delivery preferences
- Lacking in observability and analytics

### Solution

Build a **decoupled, event-driven notification service** that:

1. Ingests events from multiple sources via message broker
2. Applies user preferences and business rules
3. Routes to appropriate delivery channels
4. Handles retries, deduplication, and tracking
5. Provides analytics and observability

---

## 2. Architecture

### High-Level Architecture

```
┌─────────────────┐
│  Event Sources  │ (User actions, scheduled jobs, webhooks)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  NATS JetStream │ (Event streaming + persistence)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Event Ingestion│ (Validate, enrich, deduplicate)
│     Service     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Preference     │ (Apply user preferences, business rules)
│   Engine        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Channel Router │ (Route to email/SMS/push/in-app)
└────────┬────────┘
         │
    ┌────┴────┬────────┬────────┐
    ▼         ▼        ▼        ▼
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│Email │ │ SMS  │ │ Push │ │In-App│
│Worker│ │Worker│ │Worker│ │Worker│
└──────┘ └──────┘ └──────┘ └──────┘
    │         │        │        │
    └────┬────┴────────┴────────┘
         ▼
┌─────────────────┐
│  Delivery       │ (Track status, retries, analytics)
│   Tracker       │
└─────────────────┘
```

### System Components

#### 1. Event Ingestion Service

- **Responsibility**: Receive events, validate, enrich, deduplicate
- **Input**: NATS JetStream events
- **Output**: Enriched events to Preference Engine
- **Stack**: Node.js, NATS client, Redis (deduplication cache)

#### 2. Preference Engine

- **Responsibility**: Apply user preferences and business rules
- **Logic**:
  - Check if user opted out of channel
  - Check if event type is subscribed
  - Apply quiet hours
  - Rate limiting per user
- **Stack**: Node.js, PostgreSQL (preferences), Redis (rate limiting)

#### 3. Channel Router

- **Responsibility**: Route events to appropriate delivery workers
- **Logic**:
  - Select template for channel
  - Enrich with user data (email, phone, device tokens)
  - Enqueue to channel-specific queues
- **Stack**: Node.js, NATS JetStream

#### 4. Delivery Workers (Email/SMS/Push/In-App)

- **Responsibility**: Send notifications via external APIs
- **Features**:
  - Retry with exponential backoff
  - Circuit breaker for external APIs
  - Dead letter queue for failed deliveries
  - Delivery acknowledgment
- **Stack**:
  - Email: Nodemailer (SMTP) or SendGrid API
  - SMS: Twilio API (mock for MVP)
  - Push: FCM/APNS (mock for MVP)
  - In-App: WebSocket broadcast

#### 5. Delivery Tracker

- **Responsibility**: Track delivery status, analytics, retries
- **Storage**: PostgreSQL (delivery history), Redis (recent status)
- **Stack**: Node.js, PostgreSQL, Redis

---

## 3. Data Model

### PostgreSQL Schema

#### users

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  push_tokens JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### notification_preferences

```sql
CREATE TABLE notification_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL, -- 'email' | 'sms' | 'push' | 'in_app'
  event_type TEXT NOT NULL, -- 'account' | 'security' | 'marketing' | 'system'
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  quiet_hours_start TIME, -- e.g., '22:00:00'
  quiet_hours_end TIME,   -- e.g., '08:00:00'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, channel, event_type)
);
```

#### notification_templates

```sql
CREATE TABLE notification_templates (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  event_type TEXT NOT NULL,
  subject TEXT, -- for email
  body TEXT NOT NULL,
  variables JSONB DEFAULT '[]', -- ['userName', 'actionUrl']
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(channel, event_type)
);
```

#### notification_deliveries

```sql
CREATE TABLE notification_deliveries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_id TEXT NOT NULL, -- idempotency key
  status TEXT NOT NULL, -- 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced'
  attempt_count INT NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  UNIQUE(event_id, user_id, channel)
);

CREATE INDEX idx_deliveries_user_id ON notification_deliveries(user_id);
CREATE INDEX idx_deliveries_status ON notification_deliveries(status);
CREATE INDEX idx_deliveries_created_at ON notification_deliveries(created_at DESC);
```

### Redis Data Structures

#### Deduplication Cache

```
Key: dedup:{eventId}:{userId}:{channel}
Value: "1"
TTL: 3600 seconds (1 hour)
```

#### Rate Limiting

```
Key: ratelimit:{userId}:{channel}:{eventType}
Value: count
TTL: sliding window (e.g., 3600 seconds)
```

#### Recent Delivery Status (for in-app notifications)

```
Key: deliveries:{userId}:recent
Value: Sorted Set (timestamp → delivery_id)
TTL: 86400 seconds (24 hours)
```

---

## 4. Event Schema

### Event Structure (NATS JetStream)

```typescript
interface NotificationEvent {
  eventId: string; // UUID (idempotency key)
  eventType: 'account' | 'security' | 'marketing' | 'system';
  userId: string;
  channels: ('email' | 'sms' | 'push' | 'in_app')[];
  priority: 'low' | 'normal' | 'high' | 'urgent';
  data: Record<string, any>; // Template variables
  scheduledAt?: string; // ISO8601 timestamp (for scheduled notifications)
  expiresAt?: string; // ISO8601 timestamp
  metadata?: Record<string, any>;
  createdAt: string; // ISO8601 timestamp
}
```

### NATS Subjects

```
notifications.events       → All events (consumed by Ingestion Service)
notifications.enriched     → Enriched events (consumed by Preference Engine)
notifications.routed.email → Email delivery queue
notifications.routed.sms   → SMS delivery queue
notifications.routed.push  → Push delivery queue
notifications.routed.inapp → In-app delivery queue
notifications.dlq          → Dead letter queue (failed after retries)
```

---

## 5. API Design

### REST API (Next.js App Router)

#### Events

```
POST /api/events
Body: NotificationEvent
Response: { success: true, eventId: string }
```

#### Preferences

```
GET    /api/preferences
GET    /api/preferences/:channel/:eventType
POST   /api/preferences
PATCH  /api/preferences/:id
DELETE /api/preferences/:id
```

#### Deliveries

```
GET /api/deliveries
GET /api/deliveries/:id
GET /api/deliveries/stats
```

#### Templates (Admin)

```
GET    /api/admin/templates
POST   /api/admin/templates
PATCH  /api/admin/templates/:id
DELETE /api/admin/templates/:id
```

### WebSocket API (In-App Notifications)

```
// Client → Server
subscribe: { userId: string }
markRead: { deliveryId: string }

// Server → Client
notification: { id, type, data, createdAt }
```

---

## 6. Patterns & Practices

### Event-Driven Architecture

- **Async processing**: All notifications processed asynchronously via NATS
- **Loose coupling**: Services communicate only via events
- **Event sourcing lite**: Delivery history as audit log

### Reliability Patterns

- **At-least-once delivery**: NATS JetStream with acks
- **Idempotency**: Deduplicate via `eventId + userId + channel`
- **Retries**: Exponential backoff (1s, 2s, 4s, 8s, 16s)
- **Circuit breaker**: For external APIs (Twilio, SendGrid)
- **Dead letter queue**: Failed events after max retries

### Scalability Patterns

- **Horizontal scaling**: All workers stateless (scale via replicas)
- **Rate limiting**: Per-user, per-channel, sliding window
- **Batching**: Batch database writes for delivery tracking
- **Caching**: Redis for preferences, rate limits, recent deliveries

### Security Patterns

- **Input validation**: Zod schemas for all inputs
- **Authentication**: API keys for event ingestion, session for user API
- **Authorization**: Users can only view/modify their own preferences
- **Secrets management**: Environment variables, no hardcoded keys

---

## 7. Quality Gates

### Functional Requirements

- ✅ Accept events from external sources
- ✅ Deliver to email/SMS/push/in-app channels
- ✅ Respect user preferences (channel, event type)
- ✅ Track delivery status and analytics
- ✅ Retry failed deliveries
- ✅ Deduplicate events

### Non-Functional Requirements

- **Throughput**: 10,000+ events/sec (stress test with 1000 concurrent events)
- **Latency**: <1 second (event ingestion → delivery initiation)
- **Reliability**: >99% delivery success rate
- **Availability**: 99.9% uptime (health checks, auto-restart)
- **Observability**: Metrics (Prometheus), logs (structured JSON)

### Testing Strategy

- **Unit tests**: Business logic (preference engine, deduplication)
- **Integration tests**: NATS pub/sub, database operations
- **E2E tests**: Full event flow (ingestion → delivery → tracking)
- **Load tests**: Artillery or k6 (10,000 events/sec)

---

## 8. Deployment

### Infrastructure

- **Stack**: Docker Compose (MVP) → K3s (production)
- **Services**:
  - NATS JetStream (message broker)
  - PostgreSQL (preferences, deliveries)
  - Redis (deduplication, rate limiting)
  - Next.js app (REST API, WebSocket, frontend)
  - Workers (email, SMS, push, in-app)

### Observability

- **Metrics**: NATS metrics, worker throughput, delivery success rate
- **Logs**: Structured JSON logs (level, timestamp, service, message, metadata)
- **Alerts**: Failed deliveries > 5%, NATS down, database connection errors

### DNS & SSL

- **Domain**: notifications.davidfdzmorilla.dev
- **Cloudflare**: Proxied (CDN + DDoS protection)
- **SSL**: Let's Encrypt (via Cloudflare)

---

## 9. Risks & Mitigations

| Risk                        | Impact | Probability | Mitigation                                    |
| --------------------------- | ------ | ----------- | --------------------------------------------- |
| External API rate limits    | High   | Medium      | Circuit breaker, rate limiting, queue backoff |
| NATS message loss           | High   | Low         | JetStream persistence, consumer acks          |
| Database bottleneck         | Medium | Medium      | Connection pooling, read replicas (future)    |
| Event deduplication failure | Medium | Low         | Redis persistence, TTL monitoring             |
| Template injection (XSS)    | High   | Low         | Template sanitization, CSP headers            |

---

## 10. Success Metrics

### Technical

- ✅ All services pass health checks
- ✅ <1s latency (event → delivery)
- ✅ >99% delivery success rate
- ✅ Zero data loss (NATS acks)
- ✅ 10,000+ events/sec throughput

### Functional

- ✅ Users can manage preferences
- ✅ Admins can manage templates
- ✅ In-app notifications appear in real-time
- ✅ Email/SMS/push deliveries tracked
- ✅ Failed deliveries retried and logged

### Quality

- ✅ TypeScript strict mode, zero errors
- ✅ ESLint passing
- ✅ Test coverage ≥80%
- ✅ Lighthouse ≥90
- ✅ WCAG 2.1 AA compliance

---

## 11. Future Enhancements

### Phase 2 (Post-MVP)

- **Batch notifications**: Daily/weekly digests
- **A/B testing**: Template variants, delivery time optimization
- **Machine learning**: Optimal send time prediction
- **Multi-language**: i18n templates
- **Rich templates**: HTML email builder, push rich media

### Phase 3 (Advanced)

- **Webhook delivery**: Custom webhooks as a channel
- **Two-way communication**: Reply to SMS/email
- **Campaign management**: Bulk notifications with scheduling
- **Segmentation**: User groups, tags, filters
- **Analytics dashboard**: Grafana or custom dashboard

---

## 12. Open Questions

- [ ] Use SendGrid/Twilio for real delivery or mock? → **Mock for MVP, real APIs optional with env vars**
- [ ] NATS vs Kafka? → **NATS (simpler, good for learning, sufficient for MVP)**
- [ ] Monorepo or separate repos for workers? → **Monorepo (easier to manage)**
- [ ] K3s deployment or Docker Compose only? → **Docker Compose for MVP, K3s if time permits**

---

## 13. Decision Log

| Date       | Decision                               | Rationale                                               |
| ---------- | -------------------------------------- | ------------------------------------------------------- |
| 2026-02-16 | Use NATS JetStream over Kafka          | Simpler setup, lower resource usage, sufficient for MVP |
| 2026-02-16 | Mock external APIs (SendGrid, Twilio)  | Avoid costs, focus on architecture                      |
| 2026-02-16 | Monorepo with workers in same codebase | Easier dependency management, shared types              |
| 2026-02-16 | PostgreSQL + Redis for state           | Proven stack, already familiar                          |

---

**Status**: Design approved, ready for roadmap creation.
