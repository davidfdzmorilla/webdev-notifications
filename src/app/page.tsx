import Link from 'next/link';

export default function HomePage() {
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '3rem' }}>
      <h1 style={{ fontSize: '3rem', fontWeight: 'bold', marginBottom: '1rem' }}>
        🔔 Notification System
      </h1>
      <p style={{ fontSize: '1.25rem', color: '#666', marginBottom: '3rem' }}>
        Event-Driven Notification Platform with NATS, PostgreSQL, and Redis
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1.5rem',
        }}
      >
        <Link
          href="/preferences"
          style={{
            display: 'block',
            padding: '2rem',
            border: '2px solid #0070f3',
            borderRadius: '12px',
            textDecoration: 'none',
            color: 'inherit',
            transition: 'all 0.2s',
          }}
        >
          <h2
            style={{
              fontSize: '1.5rem',
              fontWeight: '600',
              marginBottom: '0.5rem',
              color: '#0070f3',
            }}
          >
            ⚙️ Preferences
          </h2>
          <p style={{ color: '#666' }}>
            Manage notification preferences, channels, and quiet hours
          </p>
        </Link>

        <Link
          href="/notifications"
          style={{
            display: 'block',
            padding: '2rem',
            border: '2px solid #22c55e',
            borderRadius: '12px',
            textDecoration: 'none',
            color: 'inherit',
            transition: 'all 0.2s',
          }}
        >
          <h2
            style={{
              fontSize: '1.5rem',
              fontWeight: '600',
              marginBottom: '0.5rem',
              color: '#22c55e',
            }}
          >
            📬 Notifications
          </h2>
          <p style={{ color: '#666' }}>View your notification delivery history</p>
        </Link>

        <Link
          href="/admin/templates"
          style={{
            display: 'block',
            padding: '2rem',
            border: '2px solid #f59e0b',
            borderRadius: '12px',
            textDecoration: 'none',
            color: 'inherit',
            transition: 'all 0.2s',
          }}
        >
          <h2
            style={{
              fontSize: '1.5rem',
              fontWeight: '600',
              marginBottom: '0.5rem',
              color: '#f59e0b',
            }}
          >
            📝 Admin: Templates
          </h2>
          <p style={{ color: '#666' }}>Manage notification templates</p>
        </Link>

        <Link
          href="/test-events"
          style={{
            display: 'block',
            padding: '2rem',
            border: '2px solid #8b5cf6',
            borderRadius: '12px',
            textDecoration: 'none',
            color: 'inherit',
            transition: 'all 0.2s',
          }}
        >
          <h2
            style={{
              fontSize: '1.5rem',
              fontWeight: '600',
              marginBottom: '0.5rem',
              color: '#8b5cf6',
            }}
          >
            🧪 Test Events
          </h2>
          <p style={{ color: '#666' }}>Submit test notification events</p>
        </Link>
      </div>

      <div
        style={{ marginTop: '3rem', padding: '2rem', background: '#f9f9f9', borderRadius: '12px' }}
      >
        <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>
          System Features
        </h3>
        <ul style={{ display: 'grid', gap: '0.5rem', color: '#444' }}>
          <li>✅ Multi-channel delivery (Email, SMS, Push, In-App)</li>
          <li>✅ Event-driven architecture with NATS JetStream</li>
          <li>✅ User preferences with quiet hours</li>
          <li>✅ Rate limiting and circuit breakers</li>
          <li>✅ Real-time WebSocket notifications</li>
          <li>✅ Template management with variable substitution</li>
          <li>✅ Delivery tracking and analytics</li>
          <li>✅ Dead letter queue for failed deliveries</li>
        </ul>
      </div>

      <div
        style={{
          marginTop: '2rem',
          padding: '1.5rem',
          background: '#fff3cd',
          borderRadius: '8px',
          border: '1px solid #ffc107',
        }}
      >
        <strong>📚 API Endpoints:</strong>
        <ul style={{ marginTop: '0.5rem', marginLeft: '1.5rem', color: '#856404' }}>
          <li>POST /api/events - Submit notification event</li>
          <li>GET /api/preferences - List user preferences</li>
          <li>GET /api/deliveries - View delivery history</li>
          <li>GET /api/deliveries/stats - Analytics</li>
          <li>GET /api/admin/templates - Manage templates</li>
        </ul>
      </div>
    </div>
  );
}
