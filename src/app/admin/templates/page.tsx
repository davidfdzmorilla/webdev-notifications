'use client';

import { useEffect, useState } from 'react';

interface Template {
  id: string;
  channel: string;
  eventType: string;
  subject: string | null;
  body: string;
  variables: string[];
}

export default function AdminTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminKey, setAdminKey] = useState('dev_admin_key_notifications_2026');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    channel: 'email',
    eventType: '',
    subject: '',
    body: '',
    variables: '',
  });

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/templates', {
        headers: { 'X-Admin-Key': adminKey },
      });
      const data = (await res.json()) as { templates?: Template[] };
      setTemplates(data.templates || []);
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const createTemplate = async () => {
    try {
      const res = await fetch('/api/admin/templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': adminKey,
        },
        body: JSON.stringify({
          channel: formData.channel,
          eventType: formData.eventType,
          subject: formData.subject || null,
          body: formData.body,
          variables: formData.variables
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean),
        }),
      });

      if (res.ok) {
        await loadTemplates();
        setShowForm(false);
        setFormData({ channel: 'email', eventType: '', subject: '', body: '', variables: '' });
      } else {
        alert('Failed to create template');
      }
    } catch (error) {
      console.error('Error creating template:', error);
      alert('Error creating template');
    }
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm('Delete this template?')) return;

    try {
      await fetch(`/api/admin/templates/${id}`, {
        method: 'DELETE',
        headers: { 'X-Admin-Key': adminKey },
      });
      await loadTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2rem',
        }}
      >
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>Admin: Notification Templates</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            padding: '0.5rem 1rem',
            background: '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          {showForm ? 'Cancel' : 'Create Template'}
        </button>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
          Admin Key:
          <input
            type="password"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            style={{
              marginLeft: '1rem',
              padding: '0.5rem',
              border: '1px solid #ddd',
              borderRadius: '4px',
              width: '300px',
            }}
          />
        </label>
      </div>

      {showForm && (
        <div
          style={{
            marginBottom: '2rem',
            padding: '1.5rem',
            border: '1px solid #ddd',
            borderRadius: '8px',
            background: '#f9f9f9',
          }}
        >
          <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>
            Create New Template
          </h2>

          <div style={{ display: 'grid', gap: '1rem' }}>
            <label>
              Channel:
              <select
                value={formData.channel}
                onChange={(e) => setFormData({ ...formData, channel: e.target.value })}
                style={{ display: 'block', marginTop: '0.25rem', padding: '0.5rem', width: '100%' }}
              >
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="push">Push</option>
                <option value="in_app">In-App</option>
              </select>
            </label>

            <label>
              Event Type:
              <input
                type="text"
                value={formData.eventType}
                onChange={(e) => setFormData({ ...formData, eventType: e.target.value })}
                style={{ display: 'block', marginTop: '0.25rem', padding: '0.5rem', width: '100%' }}
                placeholder="e.g., account, payment, marketing"
              />
            </label>

            <label>
              Subject (optional, for email/push):
              <input
                type="text"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                style={{ display: 'block', marginTop: '0.25rem', padding: '0.5rem', width: '100%' }}
                placeholder="e.g., Welcome to {{appName}}!"
              />
            </label>

            <label>
              Body:
              <textarea
                value={formData.body}
                onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                style={{
                  display: 'block',
                  marginTop: '0.25rem',
                  padding: '0.5rem',
                  width: '100%',
                  minHeight: '100px',
                }}
                placeholder="Hi {{userName}}, welcome to {{appName}}!"
              />
            </label>

            <label>
              Variables (comma-separated):
              <input
                type="text"
                value={formData.variables}
                onChange={(e) => setFormData({ ...formData, variables: e.target.value })}
                style={{ display: 'block', marginTop: '0.25rem', padding: '0.5rem', width: '100%' }}
                placeholder="userName, appName, actionUrl"
              />
            </label>

            <button
              onClick={createTemplate}
              style={{
                padding: '0.75rem',
                background: '#22c55e',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: '500',
              }}
            >
              Create Template
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {templates.map((template) => (
            <div
              key={template.id}
              style={{
                padding: '1.5rem',
                border: '1px solid #eee',
                borderRadius: '8px',
                background: '#fff',
              }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}
              >
                <div>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '0.25rem 0.75rem',
                      background: '#0070f3',
                      color: 'white',
                      borderRadius: '4px',
                      fontSize: '0.875rem',
                      marginRight: '0.5rem',
                    }}
                  >
                    {template.channel}
                  </span>
                  <span style={{ fontWeight: '600', fontSize: '1.125rem' }}>
                    {template.eventType}
                  </span>
                </div>
                <button
                  onClick={() => deleteTemplate(template.id)}
                  style={{
                    padding: '0.25rem 0.75rem',
                    background: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                  }}
                >
                  Delete
                </button>
              </div>

              {template.subject && (
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Subject:</strong> {template.subject}
                </div>
              )}

              <div style={{ marginBottom: '0.5rem' }}>
                <strong>Body:</strong>
                <pre style={{ marginTop: '0.25rem', whiteSpace: 'pre-wrap', fontSize: '0.875rem' }}>
                  {template.body}
                </pre>
              </div>

              {template.variables.length > 0 && (
                <div>
                  <strong>Variables:</strong> {template.variables.join(', ')}
                </div>
              )}
            </div>
          ))}

          {templates.length === 0 && <p style={{ color: '#666' }}>No templates found.</p>}
        </div>
      )}
    </div>
  );
}
