'use client';

import { useEffect, useState } from 'react';

interface Preference {
  id: string;
  userId: string;
  channel: string;
  eventType: string;
  enabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}

export default function PreferencesPage() {
  const [userId, setUserId] = useState('wyzdvb1leulhnoiky5nxwejm'); // Default test user
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPreferences();
  }, [userId]);

  const loadPreferences = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/preferences?userId=${userId}`);
      const data = (await res.json()) as { preferences?: Preference[] };
      setPreferences(data.preferences || []);
    } catch (error) {
      console.error('Error loading preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleEnabled = async (pref: Preference) => {
    const updatedPref = { ...pref, enabled: !pref.enabled };
    setPreferences(preferences.map((p) => (p.id === pref.id ? updatedPref : p)));

    try {
      await fetch(`/api/preferences/${pref.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: updatedPref.enabled }),
      });
    } catch (error) {
      console.error('Error updating preference:', error);
      setPreferences(preferences);
    }
  };

  const updateQuietHours = async (pref: Preference, start: string | null, end: string | null) => {
    const updatedPref = { ...pref, quietHoursStart: start, quietHoursEnd: end };
    setPreferences(preferences.map((p) => (p.id === pref.id ? updatedPref : p)));

    try {
      await fetch(`/api/preferences/${pref.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quietHoursStart: start, quietHoursEnd: end }),
      });
    } catch (error) {
      console.error('Error updating quiet hours:', error);
      setPreferences(preferences);
    }
  };

  const groupedPreferences = preferences.reduce(
    (acc, pref) => {
      if (!acc[pref.eventType]) {
        acc[pref.eventType] = [];
      }
      acc[pref.eventType].push(pref);
      return acc;
    },
    {} as Record<string, Preference[]>
  );

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1rem' }}>
        Notification Preferences
      </h1>

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
          onClick={loadPreferences}
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
          Load Preferences
        </button>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div>
          {Object.entries(groupedPreferences).map(([eventType, prefs]) => (
            <div
              key={eventType}
              style={{
                marginBottom: '2rem',
                padding: '1rem',
                border: '1px solid #eee',
                borderRadius: '8px',
              }}
            >
              <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1rem' }}>
                {eventType}
              </h2>

              <div style={{ display: 'grid', gap: '1rem' }}>
                {prefs.map((pref) => (
                  <div
                    key={pref.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '1rem',
                      background: '#f9f9f9',
                      borderRadius: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <input
                        type="checkbox"
                        checked={pref.enabled}
                        onChange={() => toggleEnabled(pref)}
                        style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                      />
                      <span style={{ fontWeight: '500', textTransform: 'uppercase' }}>
                        {pref.channel}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <label style={{ fontSize: '0.875rem' }}>
                        Quiet Hours:
                        <input
                          type="time"
                          value={pref.quietHoursStart || ''}
                          onChange={(e) =>
                            updateQuietHours(pref, e.target.value || null, pref.quietHoursEnd)
                          }
                          style={{ marginLeft: '0.5rem', padding: '0.25rem' }}
                        />
                        <span style={{ margin: '0 0.5rem' }}>to</span>
                        <input
                          type="time"
                          value={pref.quietHoursEnd || ''}
                          onChange={(e) =>
                            updateQuietHours(pref, pref.quietHoursStart, e.target.value || null)
                          }
                          style={{ padding: '0.25rem' }}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {Object.keys(groupedPreferences).length === 0 && (
            <p style={{ color: '#666' }}>No preferences found for this user.</p>
          )}
        </div>
      )}
    </div>
  );
}
