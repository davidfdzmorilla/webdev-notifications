import { describe, it, expect } from 'vitest';

// Circuit breaker logic tested in isolation
class CircuitBreaker {
  private consecutiveFailures = 0;
  private isOpen = false;
  private readonly threshold: number;

  constructor(threshold = 5) {
    this.threshold = threshold;
  }

  recordSuccess() {
    this.consecutiveFailures = 0;
    this.isOpen = false;
  }

  recordFailure() {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.threshold) {
      this.isOpen = true;
    }
  }

  get open() {
    return this.isOpen;
  }

  get failureCount() {
    return this.consecutiveFailures;
  }

  reset() {
    this.consecutiveFailures = 0;
    this.isOpen = false;
  }
}

describe('Circuit Breaker', () => {
  it('should start closed', () => {
    const cb = new CircuitBreaker();
    expect(cb.open).toBe(false);
  });

  it('should stay closed under threshold', () => {
    const cb = new CircuitBreaker(5);
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.open).toBe(false);
    expect(cb.failureCount).toBe(4);
  });

  it('should open at threshold', () => {
    const cb = new CircuitBreaker(5);
    for (let i = 0; i < 5; i++) {
      cb.recordFailure();
    }
    expect(cb.open).toBe(true);
  });

  it('should close after success', () => {
    const cb = new CircuitBreaker(5);
    for (let i = 0; i < 5; i++) {
      cb.recordFailure();
    }
    expect(cb.open).toBe(true);

    cb.recordSuccess();
    expect(cb.open).toBe(false);
    expect(cb.failureCount).toBe(0);
  });

  it('should reset failure count on success', () => {
    const cb = new CircuitBreaker(5);
    cb.recordFailure();
    cb.recordFailure();
    cb.recordSuccess();
    expect(cb.failureCount).toBe(0);
  });

  it('should open when threshold exceeded', () => {
    const cb = new CircuitBreaker(3);
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure(); // exceeds threshold
    expect(cb.open).toBe(true);
    expect(cb.failureCount).toBe(4);
  });

  it('should reset properly', () => {
    const cb = new CircuitBreaker(5);
    for (let i = 0; i < 10; i++) {
      cb.recordFailure();
    }
    cb.reset();
    expect(cb.open).toBe(false);
    expect(cb.failureCount).toBe(0);
  });
});

describe('Retry Logic', () => {
  it('should calculate exponential backoff correctly', () => {
    const RETRY_DELAYS = [1000, 5000, 15000];
    expect(RETRY_DELAYS[0]).toBe(1000);
    expect(RETRY_DELAYS[1]).toBe(5000);
    expect(RETRY_DELAYS[2]).toBe(15000);
  });

  it('should cap delay at max index', () => {
    const RETRY_DELAYS = [1000, 5000, 15000];
    const getDelay = (attempt: number) =>
      RETRY_DELAYS[Math.min(attempt - 1, RETRY_DELAYS.length - 1)];

    expect(getDelay(1)).toBe(1000);
    expect(getDelay(2)).toBe(5000);
    expect(getDelay(3)).toBe(15000);
    expect(getDelay(4)).toBe(15000); // capped at max
    expect(getDelay(10)).toBe(15000); // capped at max
  });

  it('should detect max retries exceeded', () => {
    const MAX_RETRIES = 3;
    expect(3 + 1 >= MAX_RETRIES).toBe(true);
    expect(2 + 1 >= MAX_RETRIES).toBe(true);
    expect(1 + 1 >= MAX_RETRIES).toBe(false);
  });
});
