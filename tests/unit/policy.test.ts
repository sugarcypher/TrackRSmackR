import { PolicyEngine } from '../../src/core/PolicyEngine.js';
import { JarType } from '../../src/workers/CookieJarWorker.js';
import { beforeEach, describe, expect, test } from 'vitest';

describe('PolicyEngine', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine();
  });

  test('should prioritize allowlist over tracking signature', () => {
    const mockCookie = {
      name: '_ga',
      domain: '.google.com',
      value: 'GA1.2.12345',
      secure: true,
      httpOnly: false,
      session: false,
      path: '/'
    } as chrome.cookies.Cookie;

    engine.setAllowlistForTesting(['google.com']);
    const result = engine.evaluate(mockCookie);

    expect(result.action).toBe('ALLOW');
    expect(result.targetJar).toBe(JarType.VAULT);
    expect(result.reason).toContain('Allowlisted');
  });

  test('should allow essential session cookies', () => {
    const mockCookie = {
      name: 'session_id',
      domain: 'example.com',
      value: 'secret-session',
      secure: true,
      httpOnly: true,
      session: true,
      path: '/'
    } as chrome.cookies.Cookie;

    const result = engine.evaluate(mockCookie);

    expect(result.action).toBe('ALLOW');
    expect(result.targetJar).toBe(JarType.VAULT);
    expect(result.reason).toContain('Essential');
  });

  test('should decay unknown cookies by default in balanced mode', () => {
    const mockCookie = {
      name: 'random_id',
      domain: 'ads.xyz',
      value: '123',
      secure: false,
      httpOnly: false,
      session: false,
      path: '/'
    } as chrome.cookies.Cookie;

    const result = engine.evaluate(mockCookie);
    expect(result.action).toBe('DECAY');
  });

  test('should quarantine unknown cookies in strict mode', () => {
    const mockCookie = {
      name: 'random_id',
      domain: 'ads.xyz',
      value: '123',
      secure: false,
      httpOnly: false,
      session: false,
      path: '/'
    } as chrome.cookies.Cookie;

    engine.setModeForTesting('STRICT');
    const result = engine.evaluate(mockCookie);
    expect(result.action).toBe('QUARANTINE');
  });
});
