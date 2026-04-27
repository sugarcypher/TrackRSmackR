import { describe, expect, test } from 'vitest';
import { BrowserCapabilityWorker } from '../../src/workers/BrowserCapabilityWorker.js';
import { PerformanceProfilerWorker } from '../../src/workers/PerformanceProfilerWorker.js';

describe('Platform workers', () => {
  test('browser capability worker reports ready on fully supported MV3 chromium profile', () => {
    const worker = new BrowserCapabilityWorker();
    const snapshot = worker.inspect({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      manifestVersion: 3,
      cookiesApi: true,
      storageApi: true,
      alarmsApi: true
    });

    expect(snapshot.browserFamily).toBe('CHROMIUM');
    expect(snapshot.supportScore).toBe(100);
    expect(snapshot.readiness).toBe('READY');
    expect(snapshot.warnings).toEqual([]);
  });

  test('browser capability worker reports risk when critical APIs are missing', () => {
    const worker = new BrowserCapabilityWorker();
    const snapshot = worker.inspect({
      userAgent: 'custom-agent',
      manifestVersion: 2,
      cookiesApi: false,
      storageApi: true,
      alarmsApi: false
    });

    expect(snapshot.readiness).toBe('RISK');
    expect(snapshot.supportScore).toBeLessThan(65);
    expect(snapshot.warnings.join(' ')).toMatch(/manifest v3/i);
    expect(snapshot.warnings.join(' ')).toMatch(/cookies api unavailable/i);
  });

  test('performance profiler computes windowed averages and pressure', () => {
    let now = 0;
    const profiler = new PerformanceProfilerWorker(() => now);

    profiler.start('evt-1');
    now = 5;
    profiler.markClassified('evt-1');
    now = 9;
    profiler.markEnforced('evt-1');
    now = 12;
    let snapshot = profiler.finalize('evt-1');

    expect(snapshot.samples).toBe(1);
    expect(snapshot.avgTotalMs).toBe(12);
    expect(snapshot.pressure).toBe('ELEVATED');

    profiler.start('evt-2');
    now = 60;
    profiler.markClassified('evt-2');
    now = 100;
    profiler.markEnforced('evt-2');
    now = 140;
    snapshot = profiler.finalize('evt-2');

    expect(snapshot.samples).toBe(2);
    expect(snapshot.p95TotalMs).toBeGreaterThanOrEqual(120);
    expect(snapshot.pressure).toBe('CRITICAL');
  });
});
