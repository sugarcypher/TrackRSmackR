import { describe, expect, test } from 'vitest';
import type { AuditEntry } from '../../src/core/AuditLog.js';
import { PatternDriftWorker } from '../../src/workers/PatternDriftWorker.js';
import { BehavioralFingerprintWorker } from '../../src/workers/BehavioralFingerprintWorker.js';
import { ThreatModelWorker } from '../../src/workers/ThreatModelWorker.js';

function makeEntry(partial: Partial<AuditEntry>): AuditEntry {
  return {
    timestamp: Date.now(),
    domain: 'example.com',
    name: 'cookie',
    action: 'ALLOW',
    reason: 'test',
    eventType: 'COOKIE_DECISION',
    ...partial
  };
}

describe('Intelligence workers', () => {
  test('pattern drift worker detects accelerating pattern', () => {
    const driftWorker = new PatternDriftWorker();

    const history: AuditEntry[] = [
      makeEntry({
        domain: 'tracker.example',
        action: 'QUARANTINE',
        driftKey: 'tracker.example|QUARANTINE|possible fingerprint identifier'
      }),
      makeEntry({
        domain: 'tracker.example',
        action: 'QUARANTINE',
        driftKey: 'tracker.example|QUARANTINE|possible fingerprint identifier'
      }),
      makeEntry({
        domain: 'tracker.example',
        action: 'QUARANTINE',
        driftKey: 'tracker.example|QUARANTINE|possible fingerprint identifier'
      }),
      makeEntry({
        domain: 'tracker.example',
        action: 'QUARANTINE',
        driftKey: 'tracker.example|QUARANTINE|possible fingerprint identifier'
      }),
      makeEntry({
        domain: 'tracker.example',
        action: 'QUARANTINE',
        driftKey: 'tracker.example|QUARANTINE|possible fingerprint identifier'
      })
    ];

    const analysis = driftWorker.analyze(history, {
      recentWindowSize: 4,
      baselineWindowSize: 1,
      minRecent: 2,
      minDelta: 2
    });

    expect(analysis.alerts.length).toBe(1);
    expect(analysis.alerts[0]?.domain).toBe('tracker.example');
    expect(analysis.alerts[0]?.delta).toBe(3);
  });

  test('behavioral fingerprint worker computes recurring pressure', () => {
    const worker = new BehavioralFingerprintWorker();

    const history: AuditEntry[] = [
      makeEntry({
        domain: 'tracker.one',
        adaptationSignals: ['Possible fingerprint identifier']
      }),
      makeEntry({
        domain: 'tracker.one',
        adaptationSignals: ['Possible fingerprint identifier']
      }),
      makeEntry({
        domain: 'tracker.two',
        adaptationSignals: ['Long hex-like value']
      }),
      makeEntry({
        domain: 'tracker.two',
        adaptationSignals: ['Long hex-like value']
      }),
      makeEntry({
        domain: 'tracker.three',
        adaptationSignals: ['Possible fingerprint identifier']
      })
    ];

    const pressure = worker.analyze(history);

    expect(pressure.recentEvents).toBe(5);
    expect(pressure.recurringDomains).toEqual(['tracker.one', 'tracker.two']);
    expect(pressure.pressureLevel).toBe('MEDIUM');
  });

  test('threat model worker synthesizes elevated posture from signals', () => {
    const driftWorker = new PatternDriftWorker();
    const fingerprintWorker = new BehavioralFingerprintWorker();
    const threatModel = new ThreatModelWorker();

    const history: AuditEntry[] = [
      makeEntry({
        action: 'QUARANTINE',
        domain: 'tracker.example',
        adaptationSignals: ['Possible fingerprint identifier'],
        driftKey: 'tracker.example|QUARANTINE|possible fingerprint identifier'
      }),
      makeEntry({
        action: 'QUARANTINE',
        domain: 'tracker.example',
        adaptationSignals: ['Possible fingerprint identifier'],
        driftKey: 'tracker.example|QUARANTINE|possible fingerprint identifier'
      }),
      makeEntry({
        action: 'QUARANTINE',
        domain: 'tracker.example',
        adaptationSignals: ['Possible fingerprint identifier'],
        driftKey: 'tracker.example|QUARANTINE|possible fingerprint identifier'
      }),
      makeEntry({
        action: 'QUARANTINE',
        domain: 'tracker.example',
        adaptationSignals: ['Possible fingerprint identifier'],
        driftKey: 'tracker.example|QUARANTINE|possible fingerprint identifier'
      }),
      makeEntry({
        action: 'QUARANTINE',
        domain: 'tracker.example',
        adaptationSignals: ['Possible fingerprint identifier'],
        driftKey: 'tracker.example|QUARANTINE|possible fingerprint identifier'
      }),
      makeEntry({
        action: 'QUARANTINE',
        domain: 'tracker.example',
        adaptationSignals: ['Possible fingerprint identifier'],
        driftKey: 'tracker.example|QUARANTINE|possible fingerprint identifier'
      })
    ];

    const drift = driftWorker.analyze(history, {
      recentWindowSize: 5,
      baselineWindowSize: 1,
      minRecent: 2,
      minDelta: 2
    });
    const fingerprint = fingerprintWorker.analyze(history);
    const summary = threatModel.summarize(history, drift, fingerprint);

    expect(summary.posture).toBe('GUARDED');
    expect(summary.driftCount).toBeGreaterThanOrEqual(1);
    expect(summary.fingerprintSignals).toBeGreaterThanOrEqual(5);
    expect(summary.source).toBe('engine');
  });
});
