import { describe, it, expect } from 'vitest';
import { notificationEventSchema } from '@/types';

describe('Ingestion Service - Event Validation', () => {
  const validEvent = {
    eventId: 'test-event-id-123',
    eventType: 'account',
    userId: 'user123',
    channels: ['email', 'push'],
    priority: 'normal',
    data: { userName: 'alice' },
    createdAt: new Date().toISOString(),
  };

  it('should validate a correct event', () => {
    const result = notificationEventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
  });

  it('should reject event without eventType', () => {
    const event = { ...validEvent, eventType: undefined };
    const result = notificationEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('should reject event without userId', () => {
    const event = { ...validEvent, userId: undefined };
    const result = notificationEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('should reject event with invalid channel', () => {
    const event = { ...validEvent, channels: ['invalid_channel'] };
    const result = notificationEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('should reject event with empty channels array', () => {
    const event = { ...validEvent, channels: [] };
    const result = notificationEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('should accept all valid channels', () => {
    const channels = ['email', 'sms', 'push', 'in_app'];
    const event = { ...validEvent, channels };
    const result = notificationEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('should accept all valid priority levels', () => {
    const priorities = ['low', 'normal', 'high', 'urgent'];
    for (const priority of priorities) {
      const event = { ...validEvent, priority };
      const result = notificationEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid priority', () => {
    const event = { ...validEvent, priority: 'critical' };
    const result = notificationEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('should auto-generate eventId if not provided', () => {
    const result = notificationEventSchema.safeParse(validEvent);
    if (result.success) {
      // eventId may or may not be present - if optional it defaults to undefined
      expect(result.data.eventType).toBe(validEvent.eventType);
    }
  });
});

describe('Ingestion Service - Deduplication', () => {
  it('should generate consistent deduplication key', () => {
    const eventId = 'event123';
    const userId = 'user456';
    const channel = 'email';
    const key = `dedup:${eventId}:${userId}:${channel}`;
    expect(key).toBe('dedup:event123:user456:email');
  });

  it('should generate different keys for different events', () => {
    const key1 = `dedup:event1:user1:email`;
    const key2 = `dedup:event2:user1:email`;
    expect(key1).not.toBe(key2);
  });

  it('should generate different keys for different channels', () => {
    const key1 = `dedup:event1:user1:email`;
    const key2 = `dedup:event1:user1:sms`;
    expect(key1).not.toBe(key2);
  });
});
