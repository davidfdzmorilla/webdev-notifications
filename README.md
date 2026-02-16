# Event-Driven Notification System

A production-grade, scalable notification service with multi-channel delivery (email, SMS, push, in-app), user preferences, retry logic, and observability.

**🌐 Live**: [https://notifications.davidfdzmorilla.dev](https://notifications.davidfdzmorilla.dev) _(Coming soon)_  
**📦 Repo**: [github.com/davidfdzmorilla/webdev-notifications](https://github.com/davidfdzmorilla/webdev-notifications)

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS 4
- **Event Streaming**: NATS JetStream
- **Database**: PostgreSQL 16 (Drizzle ORM)
- **Cache**: Redis 7 (deduplication, rate limiting)
- **Real-time**: Socket.io (WebSocket)
- **Delivery Channels**: Email (Nodemailer), SMS (Twilio mock), Push (FCM mock), In-App
- **Infrastructure**: Docker Compose, Nginx, Cloudflare

## Features

- **Multi-Channel Delivery**: Email, SMS, Push notifications, In-app notifications
- **Event-Driven Architecture**: NATS JetStream for reliable message streaming
- **User Preferences**: Per-channel, per-event-type preferences with quiet hours
- **Retry Logic**: Exponential backoff with circuit breaker pattern
- **Deduplication**: Idempotent event processing with Redis cache
- **Rate Limiting**: Per-user, per-channel sliding window rate limiting
- **Real-time WebSocket**: Live in-app notifications via Socket.io
- **Delivery Tracking**: Complete audit log with analytics
- **Template Engine**: Dynamic notification templates with variable substitution
- **Observability**: Structured logging, health checks, metrics (Prometheus-ready)

## Architecture

```
┌─────────────┐
│Event Sources│ → NATS JetStream → Ingestion → Preferences → Router
└─────────────┘                                                  │
                                                    ┌────────────┼────────────┐
                                                    ▼            ▼            ▼
                                                 Email        SMS          Push
                                                 Worker       Worker       Worker
                                                    │            │            │
                                                    └────────────┴────────────┘
                                                              ▼
                                                     Delivery Tracker
                                                     (PostgreSQL + Redis)
```

For detailed architecture and design decisions, see [docs/DESIGN.md](docs/DESIGN.md).

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm
- Docker & Docker Compose

### Development

```bash
# Install dependencies
pnpm install

# Start infrastructure (NATS, PostgreSQL, Redis)
make up

# Run database migrations
pnpm db:push

# Start development server
pnpm dev
```

The app will be available at http://localhost:3010.

### Production (Docker)

```bash
# Build and start all services
docker compose up -d

# View logs
make logs
```

## Project Structure

```
src/
├── app/                 # Next.js App Router pages
│   ├── api/             # REST API routes
│   │   ├── events/      # Event submission
│   │   ├── preferences/ # User preferences
│   │   ├── deliveries/  # Delivery tracking
│   │   └── admin/       # Admin templates
│   ├── layout.tsx       # Root layout
│   └── page.tsx         # Homepage
├── lib/                 # Core libraries
│   ├── db/              # Database (Drizzle ORM)
│   ├── nats/            # NATS client
│   ├── redis/           # Redis client
│   └── socket/          # Socket.io server
├── services/            # Background services
│   ├── ingestion.ts     # Event ingestion service
│   ├── preferences.ts   # Preference engine
│   ├── router.ts        # Channel router
│   └── workers/         # Delivery workers
│       ├── email.ts
│       ├── sms.ts
│       ├── push.ts
│       └── inapp.ts
├── types/               # TypeScript types
└── utils/               # Utility functions
```

## Testing

```bash
# Run all tests
pnpm test

# Run linter
pnpm lint

# Run formatter
pnpm format
```

## Deployment

1. Build Docker image:

   ```bash
   docker build -t webdev-notifications:latest .
   ```

2. Deploy with Docker Compose:

   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```

3. Configure Cloudflare DNS:

   ```bash
   # Create A record for notifications.davidfdzmorilla.dev
   ```

4. Verify at https://notifications.davidfdzmorilla.dev

## Documentation

- [Design Document](docs/DESIGN.md) - Architecture, data model, API design
- [Roadmap](docs/ROADMAP.md) - Milestones and implementation plan
- [Verification Report](docs/VERIFICATION.md) - Deployment verification _(Coming soon)_

## API Reference

### Event Submission

```bash
POST /api/events
Content-Type: application/json

{
  "eventId": "evt_123",
  "eventType": "account",
  "userId": "user_123",
  "channels": ["email", "push"],
  "priority": "high",
  "data": {
    "userName": "John Doe",
    "actionUrl": "https://example.com/verify"
  }
}
```

### Preferences

```bash
# Get user preferences
GET /api/preferences

# Update preference
PATCH /api/preferences/:id
{
  "enabled": false
}
```

### Deliveries

```bash
# List user deliveries
GET /api/deliveries

# Get delivery details
GET /api/deliveries/:id

# Get analytics
GET /api/deliveries/stats
```

## Environment Variables

Create `.env.local`:

```env
# Database
DATABASE_URL=postgresql://notifications:notifications_dev_password@localhost:5435/notifications

# Redis
REDIS_URL=redis://localhost:6380

# NATS
NATS_URL=nats://localhost:4222

# External APIs (optional for MVP)
SENDGRID_API_KEY=your_key_here
TWILIO_ACCOUNT_SID=your_sid_here
TWILIO_AUTH_TOKEN=your_token_here
FCM_SERVER_KEY=your_key_here

# App
PORT=3010
NODE_ENV=development
```

## License

MIT

---

**Built with ❤️ by WebDev Agent** | [Level 6.2 - Advanced Cloud-Native & Real-Time Systems]
