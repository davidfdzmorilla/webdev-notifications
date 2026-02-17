'use client';

import { useEffect, useState } from 'react';

interface Delivery {
  id: string;
  eventId: string;
  userId: string;
  channel: string;
  eventType: string;
  status: string;
  attemptCount: number;
  metadata: {
    subject?: string;
    body?: string;
    priority?: string;
  };
  createdAt: string;
}

export default function NotificationsPage() {
  const [userId, setUserId] = useState('wyzdvb1leulhnoiky5nxwejm');
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDeliveries();
  }, [userId]);

  const loadDeliveries = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/deliveries?userId=${userId}&limit=50`);
      const data = (await res.json()) as { deliveries?: Delivery[] };
      setDeliveries(data.deliveries || []);
    } catch (error) {
      console.error('Error loading deliveries:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredDeliveries =
    filter === 'all' ? deliveries : deliveries.filter((d) => d.eventType === filter);

  const eventTypes = Array.from(new Set(deliveries.map((d) => d.eventType)));

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1rem' }}>Notifications</h1>

      <div style={{ marginBottom: '2rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
          User ID:
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            style={{
              marginLeft: '1rem',
              padding: '0.5rem',
              border: '1px solid #ddd',
              borderRadius: '4px',
            }}
          />
        </label>
        <button
          onClick={loadDeliveries}
          style={{
            marginTop: '0.5rem',
            padding: '0.5rem 1rem',
            background: '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Reload
        </button>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <label style={{ marginRight: '1rem', fontWeight: '500' }}>Filter:</label>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
        >
          <option value="all">All Types</option>
          {eventTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {filteredDeliveries.map((delivery) => (
            <div
              key={delivery.id}
              style={{
                padding: '1rem',
                border: '1px solid #eee',
                borderRadius: '8px',
                background: '#f9f9f9',
              }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}
              >
                <div>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '0.25rem 0.5rem',
                      background: '#0070f3',
                      color: 'white',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      marginRight: '0.5rem',
                    }}
                  >
                    {delivery.eventType}
                  </span>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '0.25rem 0.5rem',
                      background: delivery.status === 'delivered' ? '#22c55e' : '#ef4444',
                      color: 'white',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                    }}
                  >
                    {delivery.status}
                  </span>
                </div>
                <span style={{ fontSize: '0.875rem', color: '#666' }}>
                  {new Date(delivery.createdAt).toLocaleString()}
                </span>
              </div>

              {delivery.metadata?.subject && (
                <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                  {delivery.metadata.subject}
                </h3>
              )}

              {delivery.metadata?.body && (
                <p style={{ fontSize: '0.875rem', color: '#444', marginBottom: '0.5rem' }}>
                  {delivery.metadata.body}
                </p>
              )}

              <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.5rem' }}>
                <span>Channel: {delivery.channel}</span>
                <span style={{ margin: '0 0.5rem' }}>•</span>
                <span>Attempts: {delivery.attemptCount}</span>
                <span style={{ margin: '0 0.5rem' }}>•</span>
                <span>Event ID: {delivery.eventId}</span>
              </div>
            </div>
          ))}

          {filteredDeliveries.length === 0 && (
            <p style={{ color: '#666' }}>No notifications found.</p>
          )}
        </div>
      )}
    </div>
  );
}
