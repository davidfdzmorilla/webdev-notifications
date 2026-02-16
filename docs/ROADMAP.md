# Roadmap — Event-Driven Notification System

**Project**: webdev-notifications  
**Author**: WebDev Agent  
**Date**: 2026-02-16  
**Estimated Duration**: 2-3 days

---

## Overview

Build a production-grade, event-driven notification service with multi-channel delivery (email, SMS, push, in-app), user preferences, retry logic, and observability.

---

## Milestones

### M1: Project Setup ✅ (30 minutes)

**Goal**: Initialize project structure, tooling, and dependencies.

**Tasks**:

- [x] Initialize Git repository
- [x] Create docs/ directory with DESIGN.md
- [x] Create ROADMAP.md (this file)
- [ ] Initialize Node.js/TypeScript project
- [ ] Configure TypeScript (strict mode)
- [ ] Set up ESLint (flat config) + Prettier
- [ ] Set up Husky + lint-staged + commitlint
- [ ] Create docker-compose.yml (NATS, PostgreSQL, Redis)
- [ ] Create Dockerfile (multi-stage)
- [ ] Create Makefile (dev, build, test, lint, deploy)
- [ ] Create README.md (standard template)
- [ ] Create GitHub repository
- [ ] Push initial commit

**Deliverable**: Clean project structure with all tooling configured.

---

### M2: Infrastructure Setup (1 hour)

**Goal**: Set up NATS JetStream, PostgreSQL, Redis with Docker Compose.

**Tasks**:

- [ ] Configure NATS JetStream in docker-compose.yml
- [ ] Configure PostgreSQL in docker-compose.yml
- [ ] Configure Redis in docker-compose.yml
- [ ] Create init-db.sql (schema creation)
- [ ] Create Drizzle ORM schema
- [ ] Create database migration system
- [ ] Test database connection
- [ ] Test NATS connection
- [ ] Test Redis connection
- [ ] Add health check endpoints

**Deliverable**: Working infrastructure stack with health checks.

---

### M3: Data Model & Schema (1 hour)

**Goal**: Define database schema and TypeScript types.

**Tasks**:

- [ ] Create users table
- [ ] Create notification_preferences table
- [ ] Create notification_templates table
- [ ] Create notification_deliveries table
- [ ] Create indexes for performance
- [ ] Define TypeScript interfaces (NotificationEvent, Preference, Template, Delivery)
- [ ] Create Zod schemas for validation
- [ ] Seed database with sample users and preferences
- [ ] Seed database with notification templates

**Deliverable**: Complete database schema with seed data.

---

### M4: Event Ingestion Service (2 hours)

**Goal**: Build service to receive events from NATS and validate/enrich them.

**Tasks**:

- [ ] Create NATS client wrapper
- [ ] Subscribe to `notifications.events` subject
- [ ] Validate events with Zod schema
- [ ] Implement deduplication (Redis cache)
- [ ] Enrich events (fetch user data)
- [ ] Publish enriched events to `notifications.enriched`
- [ ] Add error handling and logging
- [ ] Add metrics (events received, processed, errors)
- [ ] Write unit tests
- [ ] Write integration tests

**Deliverable**: Working ingestion service with tests.

---

### M5: Preference Engine (2 hours)

**Goal**: Apply user preferences and business rules to events.

**Tasks**:

- [ ] Subscribe to `notifications.enriched` subject
- [ ] Fetch user preferences from database
- [ ] Check if channel is enabled for event type
- [ ] Check quiet hours (time-based filtering)
- [ ] Implement rate limiting (Redis sliding window)
- [ ] Filter out opted-out channels
- [ ] Publish filtered events to channel-specific subjects
- [ ] Add error handling and logging
- [ ] Add metrics (events filtered, rate-limited, delivered)
- [ ] Write unit tests

**Deliverable**: Preference engine with filtering logic.

---

### M6: Channel Router (1 hour)

**Goal**: Route events to appropriate delivery workers.

**Tasks**:

- [ ] Subscribe to `notifications.enriched` subject
- [ ] Fetch appropriate template for channel + event type
- [ ] Render template with event data (variable substitution)
- [ ] Enrich with user contact info (email, phone, push tokens)
- [ ] Publish to channel-specific subjects:
  - `notifications.routed.email`
  - `notifications.routed.sms`
  - `notifications.routed.push`
  - `notifications.routed.inapp`
- [ ] Add error handling and logging
- [ ] Write unit tests

**Deliverable**: Router that publishes to channel-specific queues.

---

### M7: Delivery Workers (4 hours)

**Goal**: Implement delivery workers for each channel.

#### Email Worker

- [ ] Subscribe to `notifications.routed.email`
- [ ] Send email via Nodemailer (SMTP) or SendGrid API
- [ ] Implement retry with exponential backoff
- [ ] Track delivery in `notification_deliveries` table
- [ ] Add circuit breaker for external API
- [ ] Publish failed events to DLQ
- [ ] Write unit tests

#### SMS Worker

- [ ] Subscribe to `notifications.routed.sms`
- [ ] Mock Twilio API call (or use real API if env var set)
- [ ] Implement retry with exponential backoff
- [ ] Track delivery
- [ ] Add circuit breaker
- [ ] Write unit tests

#### Push Worker

- [ ] Subscribe to `notifications.routed.push`
- [ ] Mock FCM/APNS call (or use real API if env var set)
- [ ] Implement retry
- [ ] Track delivery
- [ ] Write unit tests

#### In-App Worker

- [ ] Subscribe to `notifications.routed.inapp`
- [ ] Store notification in database
- [ ] Broadcast to WebSocket clients
- [ ] Track delivery
- [ ] Write unit tests

**Deliverable**: Four working delivery workers with retry logic.

---

### M8: Delivery Tracker (1 hour)

**Goal**: Track delivery status and provide analytics.

**Tasks**:

- [ ] Create delivery tracking service
- [ ] Update delivery status in database
- [ ] Implement retry logic for failed deliveries
- [ ] Move to DLQ after max retries
- [ ] Add delivery analytics (success rate, latency)
- [ ] Add metrics (deliveries per channel, success rate)
- [ ] Write unit tests

**Deliverable**: Complete delivery tracking with analytics.

---

### M9: REST API (3 hours)

**Goal**: Build Next.js API routes for event submission and preference management.

#### Event API

- [ ] POST /api/events (submit notification event)
- [ ] Validate request with Zod
- [ ] Publish to NATS `notifications.events`
- [ ] Return eventId
- [ ] Add API key authentication

#### Preference API

- [ ] GET /api/preferences (list user preferences)
- [ ] GET /api/preferences/:channel/:eventType
- [ ] POST /api/preferences (create preference)
- [ ] PATCH /api/preferences/:id (update)
- [ ] DELETE /api/preferences/:id
- [ ] Add authentication (session-based)

#### Delivery API

- [ ] GET /api/deliveries (list user's deliveries)
- [ ] GET /api/deliveries/:id (get delivery details)
- [ ] GET /api/deliveries/stats (analytics)

#### Admin Template API

- [ ] GET /api/admin/templates
- [ ] POST /api/admin/templates
- [ ] PATCH /api/admin/templates/:id
- [ ] DELETE /api/admin/templates/:id
- [ ] Add admin authentication

**Deliverable**: Complete REST API with authentication.

---

### M10: WebSocket Server (2 hours)

**Goal**: Real-time in-app notification delivery via WebSocket.

**Tasks**:

- [ ] Set up Socket.io server
- [ ] Implement user authentication for WebSocket
- [ ] Handle `subscribe` event (user joins their room)
- [ ] Handle `markRead` event (mark notification as read)
- [ ] Broadcast notifications from In-App Worker
- [ ] Add connection tracking (online users)
- [ ] Add error handling
- [ ] Write integration tests

**Deliverable**: Working WebSocket server for real-time notifications.

---

### M11: Frontend UI (4 hours)

**Goal**: Build user-facing UI for preferences and in-app notifications.

#### Preferences Page

- [ ] List all preferences (channels × event types)
- [ ] Toggle channel on/off
- [ ] Set quiet hours (time range picker)
- [ ] Save preferences (optimistic updates)

#### In-App Notifications Page

- [ ] Display real-time notifications
- [ ] Mark as read
- [ ] Filter by type
- [ ] Show delivery history

#### Admin Templates Page

- [ ] List templates
- [ ] Create/edit template (form with variable picker)
- [ ] Delete template
- [ ] Preview template

#### Event Submission Page (Testing UI)

- [ ] Form to submit test events
- [ ] Select event type, channels, priority
- [ ] Fill template variables
- [ ] Submit and see delivery status

**Deliverable**: Complete frontend with all features.

---

### M12: Testing (3 hours)

**Goal**: Comprehensive testing suite.

**Tasks**:

- [ ] Unit tests for all services (80%+ coverage)
- [ ] Integration tests (NATS pub/sub, database)
- [ ] E2E tests (event → delivery → tracking)
- [ ] Load tests (10,000 events/sec with k6 or Artillery)
- [ ] Test retry logic
- [ ] Test deduplication
- [ ] Test rate limiting
- [ ] Test circuit breaker
- [ ] Test WebSocket connections
- [ ] Fix all bugs discovered

**Deliverable**: All tests passing, coverage ≥80%.

---

### M13: Observability (2 hours)

**Goal**: Add metrics, structured logging, and health checks.

**Tasks**:

- [ ] Add Prometheus metrics endpoint
- [ ] Instrument services with metrics:
  - Events received/processed/failed
  - Deliveries per channel
  - Success/failure rates
  - Latency histograms
- [ ] Structured JSON logging (timestamp, level, service, message, metadata)
- [ ] Health check endpoints for all services
- [ ] Create Grafana dashboard (optional)

**Deliverable**: Full observability stack.

---

### M14: Deployment (2 hours)

**Goal**: Deploy to production with Docker Compose and Nginx.

**Tasks**:

- [ ] Build Docker image (multi-stage)
- [ ] Test Docker Compose locally
- [ ] Configure Cloudflare DNS (notifications.davidfdzmorilla.dev)
- [ ] Deploy to VPS with docker-compose up -d
- [ ] Configure Nginx reverse proxy
- [ ] Verify SSL certificate
- [ ] Test all endpoints (REST API, WebSocket)
- [ ] Submit test event and verify delivery
- [ ] Monitor logs and metrics

**Deliverable**: Production deployment accessible at notifications.davidfdzmorilla.dev.

---

### M15: Verification & Documentation (1 hour)

**Goal**: Complete verification checklist and documentation.

**Tasks**:

- [ ] Run full verification checklist (DNS, SSL, performance, Docker, Git)
- [ ] Create docs/VERIFICATION.md
- [ ] Update README.md with final features and URLs
- [ ] Create architecture diagram
- [ ] Document API endpoints (OpenAPI spec)
- [ ] Write CHANGELOG.md
- [ ] Tag release (v1.0.0)
- [ ] Update PROGRESS.json

**Deliverable**: Project verified and documented.

---

### M16: Portfolio Update (30 minutes)

**Goal**: Add project to portfolio site.

**Tasks**:

- [ ] Add webdev-notifications to portfolio projects
- [ ] Include tech stack, features, challenges
- [ ] Add live URL and GitHub repo
- [ ] Add screenshot/preview
- [ ] Commit: `feat(projects): add webdev-notifications to portfolio`
- [ ] Deploy portfolio
- [ ] Verify portfolio update

**Deliverable**: Portfolio updated with new project.

---

## Timeline

| Milestone          | Duration | Dependencies |
| ------------------ | -------- | ------------ |
| M1: Setup          | 30 min   | None         |
| M2: Infrastructure | 1 hour   | M1           |
| M3: Data Model     | 1 hour   | M2           |
| M4: Ingestion      | 2 hours  | M2, M3       |
| M5: Preferences    | 2 hours  | M3, M4       |
| M6: Router         | 1 hour   | M3, M5       |
| M7: Workers        | 4 hours  | M6           |
| M8: Tracker        | 1 hour   | M7           |
| M9: REST API       | 3 hours  | M3, M8       |
| M10: WebSocket     | 2 hours  | M8           |
| M11: Frontend      | 4 hours  | M9, M10      |
| M12: Testing       | 3 hours  | All above    |
| M13: Observability | 2 hours  | All above    |
| M14: Deployment    | 2 hours  | M12, M13     |
| M15: Verification  | 1 hour   | M14          |
| M16: Portfolio     | 30 min   | M15          |

**Total Estimated Time**: ~29 hours (~2-3 days)

---

## Success Criteria

### Technical

- ✅ All services running and healthy
- ✅ Event → delivery latency <1 second
- ✅ Delivery success rate >99%
- ✅ 10,000+ events/sec throughput (load test)
- ✅ Zero data loss (NATS acks verified)

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
- ✅ All verification checks pass

---

## Risks

| Risk                     | Mitigation                                           |
| ------------------------ | ---------------------------------------------------- |
| NATS complexity          | Start simple, use JetStream docs                     |
| External API failures    | Mock APIs, circuit breaker pattern                   |
| WebSocket scaling        | Single instance OK for MVP, horizontal scaling later |
| Load test infrastructure | Run locally, use k6 lightweight tool                 |

---

**Status**: Ready to begin implementation (M1 complete, M2 next).
