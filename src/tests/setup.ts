import { vi } from 'vitest';

// Mock environment variables
process.env.DATABASE_URL =
  'postgresql://notifications:notifications_dev_password@localhost:5437/notifications';
process.env.REDIS_URL = 'redis://localhost:6380';
process.env.NATS_URL = 'nats://localhost:4222';
process.env.API_KEY = 'test_api_key';
process.env.ADMIN_KEY = 'test_admin_key';

// Suppress console output during tests
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
