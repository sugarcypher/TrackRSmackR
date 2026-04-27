import { describe, expect, test } from 'vitest';
import type { AuditEntry } from '../../src/core/AuditLog.js';
import type { IntelligenceSummary } from '../../src/core/IntelligenceTypes.js';
import { TutorSwarmWorker } from '../../src/workers/TutorSwarmWorker.js';

function makeSummary(partial: Partial<IntelligenceSummary>): IntelligenceSummary {
  return {
    posture: 'STABLE',
    trend: 'STEADY',
    score: 2,
    driftCount: 0,
    topDriftAlerts: [],
    fingerprintSignals: 0,
    recurringFingerprintDomains: [],
    deceptionProbes: 0,
    deceptionRouteHotspots: [],
    severeActions: 0,
    modelVersion: 2,
    source: 'engine',
    updatedAt: Date.now(),
    ...partial
  };
}

function makeHistory(total: number, severeActions: number, strongOutcomes: number): AuditEntry[] {
  const entries: AuditEntry[] = [];

  for (let i = 0; i < total; i += 1) {
    const severe = i < severeActions;
    const strongOutcome = i < strongOutcomes;

    entries.push({
      timestamp: Date.now() + i,
      domain: severe ? 'tracker.example' : 'site.example',
      name: severe ? `id_${i}` : `session_${i}`,
      action: severe ? 'QUARANTINE' : 'ALLOW',
      reason: severe ? 'tracker' : 'allow',
      eventType: 'COOKIE_DECISION',
      outcome: strongOutcome ? 'REMOVED_AND_QUARANTINED' : severe ? 'DECAY_PENDING' : 'ALLOWED'
    });
  }

  return entries;
}

describe('TutorSwarmWorker', () => {
  test('emits adjust-params signal on divergence threshold breach', () => {
    const worker = new TutorSwarmWorker();
    const history = makeHistory(20, 20, 0);

    const snapshot = worker.evaluate(history, makeSummary({ score: 4 }));

    expect(snapshot.signal).toBe('INTERVENE_ADJUST_PARAMS');
    expect(snapshot.interventionAction).toBe('PARAMS_ADJUSTED');
    expect(snapshot.divergenceGap).toBeGreaterThan(0.15);
  });

  test('emits security alert when posture is elevated and rising', () => {
    const worker = new TutorSwarmWorker();
    const history = makeHistory(20, 8, 4);

    const snapshot = worker.evaluate(
      history,
      makeSummary({ posture: 'ELEVATED', trend: 'RISING', score: 30 })
    );

    expect(snapshot.signal).toBe('SECURITY_ALERT');
    expect(snapshot.complianceMessage).toMatch(/blocked risky external strategy signal/i);
  });

  test('tracks controlled descent inside adaptation zone', () => {
    const worker = new TutorSwarmWorker();
    const summary = makeSummary({ score: 3 });
    const strongOutcomeSeries = [10, 10, 10, 9, 9];

    let snapshot = worker.evaluate(makeHistory(40, 16, strongOutcomeSeries[0]), summary);
    for (const count of strongOutcomeSeries.slice(1)) {
      snapshot = worker.evaluate(makeHistory(40, 16, count), summary);
    }

    expect(snapshot.signal).toBe('CONTINUE');
    expect(snapshot.adaptationZone).toBe(true);
    expect(snapshot.complianceMessage).toContain('Adaptation Zone');
    expect(snapshot.successfulAdaptations).toBeGreaterThan(0);
  });
});
