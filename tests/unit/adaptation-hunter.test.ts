import { describe, expect, test } from 'vitest';
import { AdaptationHunterWorker } from '../../src/workers/AdaptationHunterWorker.js';

function mockCookie(partial: Partial<chrome.cookies.Cookie>): chrome.cookies.Cookie {
  return {
    domain: '.tracker.example.com',
    name: 'cookie',
    value: 'value',
    path: '/',
    secure: true,
    httpOnly: false,
    session: false,
    ...partial
  } as chrome.cookies.Cookie;
}

describe('AdaptationHunterWorker', () => {
  test('detects multiple fingerprint surfaces from cookie metadata', () => {
    const worker = new AdaptationHunterWorker();
    const findings = worker.inspect(
      mockCookie({
        name: 'canvas_fp_visitorid',
        value: 'webgl|webrtc|device_memory|hardware_concurrency|font',
        domain: 'a.b.c.d.e.tracker.example.com'
      })
    );

    expect(findings).toContain('Possible fingerprint identifier');
    expect(findings).toContain('Fingerprint surface enumeration');
    expect(findings).toContain('Deep subdomain usage');
    expect(findings).toContain('Long-lived device identifier pattern');
  });

  test('flags high entropy payloads', () => {
    const worker = new AdaptationHunterWorker();
    const findings = worker.inspect(
      mockCookie({
        name: 'id',
        value: 'QWxhZGRpbjpvcGVuIHNlc2FtZSB0cmFja2luZw=='
      })
    );

    expect(findings).toContain('High-entropy token payload');
  });
});
