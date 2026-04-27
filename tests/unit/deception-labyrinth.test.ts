import { describe, expect, test } from 'vitest';
import { DeceptionLabyrinthWorker } from '../../src/workers/DeceptionLabyrinthWorker.js';

function makeCookie(partial: Partial<chrome.cookies.Cookie>): chrome.cookies.Cookie {
  return {
    domain: 'example.com',
    name: 'session_id',
    value: 'normal-value',
    path: '/',
    secure: true,
    httpOnly: true,
    session: false,
    ...partial
  } as chrome.cookies.Cookie;
}

describe('DeceptionLabyrinthWorker', () => {
  test('does not trigger on benign cookie input', () => {
    const worker = new DeceptionLabyrinthWorker();
    const result = worker.inspect(makeCookie({ name: 'theme', value: 'dark' }));

    expect(result.triggered).toBe(false);
    expect(result.probeType).toBe('NONE');
    expect(result.route).toBeNull();
  });

  test('flags path traversal probes and assigns deterministic abyss route', () => {
    const worker = new DeceptionLabyrinthWorker();
    const cookie = makeCookie({
      name: 'auth',
      value: '../../etc/passwd',
      path: '/admin'
    });

    const first = worker.inspect(cookie);
    const second = worker.inspect(cookie);

    expect(first.triggered).toBe(true);
    expect(first.probeType).toBe('PATH_TRAVERSAL');
    expect(first.route).toMatch(/^vm-lab:\/\/eternal-abyss\//);
    expect(first.route).toBe(second.route);
  });

  test('flags scanner pathway probes', () => {
    const worker = new DeceptionLabyrinthWorker();
    const result = worker.inspect(
      makeCookie({
        name: 'probe_cookie',
        path: '/phpmyadmin/index.php',
        value: 'scan=true'
      })
    );

    expect(result.triggered).toBe(true);
    expect(result.probeType).toBe('SCANNER');
    expect(result.matchedSignals.some((signal) => /scanner/i.test(signal))).toBe(true);
  });
});
