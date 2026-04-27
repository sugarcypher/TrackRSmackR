import { describe, expect, test } from 'vitest';
import { PolicyInvariantWorker } from '../../src/workers/PolicyInvariantWorker.js';
import { JarType } from '../../src/workers/CookieJarWorker.js';

function mockCookie(domain: string): chrome.cookies.Cookie {
  return {
    domain,
    name: 'random_id',
    value: '123',
    secure: true,
    httpOnly: false,
    session: false,
    path: '/'
  };
}

describe('PolicyInvariantWorker', () => {
  test('forces strict floor over decay decisions', () => {
    const worker = new PolicyInvariantWorker();
    worker.setStateForTesting({ floorMode: 'STRICT' });

    const result = worker.apply(mockCookie('example.com'), {
      action: 'DECAY',
      reason: 'Policy: Unknown Cookie (Decay)',
      targetJar: JarType.QUARANTINE
    });

    expect(result.decision.action).toBe('QUARANTINE');
    expect(result.signals).toContain('Policy invariant: strict floor');
  });

  test('quarantines blocklisted domains regardless of prior decision', () => {
    const worker = new PolicyInvariantWorker();
    worker.setStateForTesting({ blocklist: ['tracker.example'] });

    const result = worker.apply(mockCookie('ads.tracker.example'), {
      action: 'ALLOW',
      reason: 'User Allowlisted',
      targetJar: JarType.VAULT
    });

    expect(result.decision.action).toBe('QUARANTINE');
    expect(result.decision.reason).toMatch(/domain blocklist/i);
    expect(result.signals).toContain('Policy invariant: domain blocklist');
  });
});
