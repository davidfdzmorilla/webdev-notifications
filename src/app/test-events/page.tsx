'use client';

import { useState } from 'react';

export default function TestEventsPage() {
  const [apiKey, setApiKey] = useState('dev_api_key_notifications_2026');
  const [formData, setFormData] = useState({
    userId: 'wyzdvb1leulhnoiky5nxwejm',
    eventType: 'account',
    channels: ['email', 'push', 'in_app'],
    priority: 'normal',
    userName: 'alice',
    appName: 'NotificationApp',
    actionUrl: 'https://example.com/verify',
  });
  const [result, setResult] = useState<{
    success: boolean;
    eventId?: string;
    error?: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submitEvent = async () => {
    setSubmitting(true);
    setResult(null);

    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({
          eventType: formData.eventType,
          userId: formData.userId,
          channels: formData.channels,
          priority: formData.priority,
          data: {
            userName: formData.userName,
            appName: formData.appName,
            actionUrl: formData.actionUrl,
          },
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setResult({ success: true, eventId: data.eventId });
      } else {
        setResult({ success: false, error: data.error || 'Failed to submit event' });
      }
    } catch (error) {
      setResult({ success: false, error: String(error) });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleChannel = (channel: string) => {
    if (formData.channels.includes(channel)) {
      setFormData({ ...formData, channels: formData.channels.filter((c) => c !== channel) });
    } else {
      setFormData({ ...formData, channels: [...formData.channels, channel] });
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1rem' }}>
        Test Event Submission
      </h1>

      <div
        style={{
          padding: '1.5rem',
          border: '1px solid #ddd',
          borderRadius: '8px',
          background: '#f9f9f9',
        }}
      >
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            API Key:
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              style={{
                display: 'block',
                marginTop: '0.25rem',
                padding: '0.5rem',
                width: '100%',
                border: '1px solid #ddd',
                borderRadius: '4px',
              }}
            />
          </label>
        </div>

        <div style={{ display: 'grid', gap: '1rem' }}>
          <label>
            User ID:
            <input
              type="text"
              value={formData.userId}
              onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
              style={{
                display: 'block',
                marginTop: '0.25rem',
                padding: '0.5rem',
                width: '100%',
                border: '1px solid #ddd',
                borderRadius: '4px',
              }}
            />
          </label>

          <label>
            Event Type:
            <select
              value={formData.eventType}
              onChange={(e) => setFormData({ ...formData, eventType: e.target.value })}
              style={{
                display: 'block',
                marginTop: '0.25rem',
                padding: '0.5rem',
                width: '100%',
                border: '1px solid #ddd',
                borderRadius: '4px',
              }}
            >
              <option value="account">Account</option>
              <option value="payment">Payment</option>
              <option value="security">Security</option>
              <option value="marketing">Marketing</option>
            </select>
          </label>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Channels:
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
              {['email', 'sms', 'push', 'in_app'].map((channel) => (
                <label
                  key={channel}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <input
                    type="checkbox"
                    checked={formData.channels.includes(channel)}
                    onChange={() => toggleChannel(channel)}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <span style={{ textTransform: 'uppercase', fontSize: '0.875rem' }}>
                    {channel}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <label>
            Priority:
            <select
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
              style={{
                display: 'block',
                marginTop: '0.25rem',
                padding: '0.5rem',
                width: '100%',
                border: '1px solid #ddd',
                borderRadius: '4px',
              }}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>

          <hr style={{ margin: '1rem 0', border: 'none', borderTop: '1px solid #ddd' }} />

          <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
            Template Variables
          </h3>

          <label>
            User Name:
            <input
              type="text"
              value={formData.userName}
              onChange={(e) => setFormData({ ...formData, userName: e.target.value })}
              style={{
                display: 'block',
                marginTop: '0.25rem',
                padding: '0.5rem',
                width: '100%',
                border: '1px solid #ddd',
                borderRadius: '4px',
              }}
            />
          </label>

          <label>
            App Name:
            <input
              type="text"
              value={formData.appName}
              onChange={(e) => setFormData({ ...formData, appName: e.target.value })}
              style={{
                display: 'block',
                marginTop: '0.25rem',
                padding: '0.5rem',
                width: '100%',
                border: '1px solid #ddd',
                borderRadius: '4px',
              }}
            />
          </label>

          <label>
            Action URL:
            <input
              type="url"
              value={formData.actionUrl}
              onChange={(e) => setFormData({ ...formData, actionUrl: e.target.value })}
              style={{
                display: 'block',
                marginTop: '0.25rem',
                padding: '0.5rem',
                width: '100%',
                border: '1px solid #ddd',
                borderRadius: '4px',
              }}
            />
          </label>
        </div>

        <button
          onClick={submitEvent}
          disabled={submitting || formData.channels.length === 0}
          style={{
            marginTop: '1.5rem',
            padding: '0.75rem',
            width: '100%',
            background: submitting ? '#999' : '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: submitting ? 'not-allowed' : 'pointer',
            fontSize: '1rem',
            fontWeight: '600',
          }}
        >
          {submitting ? 'Submitting...' : 'Submit Event'}
        </button>
      </div>

      {result && (
        <div
          style={{
            marginTop: '1.5rem',
            padding: '1rem',
            borderRadius: '8px',
            background: result.success ? '#d1fae5' : '#fee2e2',
            border: `1px solid ${result.success ? '#22c55e' : '#ef4444'}`,
          }}
        >
          {result.success ? (
            <div>
              <strong style={{ color: '#166534' }}>✅ Event Submitted Successfully!</strong>
              <p style={{ marginTop: '0.5rem', color: '#166534' }}>Event ID: {result.eventId}</p>
              <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#166534' }}>
                Check the notifications page or run the monitor to see delivery status.
              </p>
            </div>
          ) : (
            <div>
              <strong style={{ color: '#991b1b' }}>❌ Error</strong>
              <p style={{ marginTop: '0.5rem', color: '#991b1b' }}>{result.error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
