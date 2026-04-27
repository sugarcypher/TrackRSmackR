import type { AuditEntry } from '../core/AuditLog.js';
import type {
  DriftAnalysis,
  FingerprintPressure,
  IntelligenceSummary,
  ThreatPosture,
  ThreatTrend
} from '../core/IntelligenceTypes.js';

function scoreWindow(entries: AuditEntry[]): number {
  let score = 0;
  for (const entry of entries) {
    if (entry.action === 'QUARANTINE' || entry.action === 'BLOCK') {
      score += 2;
    } else if (entry.action === 'DECAY') {
      score += 1;
    }

    if ((entry.adaptationSignals ?? []).length > 0) {
      score += 1;
    }
  }
  return score;
}

function resolveTrend(history: AuditEntry[]): ThreatTrend {
  const recent = history.slice(-50);
  const previous = history.slice(Math.max(0, history.length - 100), Math.max(0, history.length - 50));

  const recentScore = scoreWindow(recent);
  const previousScore = scoreWindow(previous);
  const delta = recentScore - previousScore;

  if (delta >= 4) {
    return 'RISING';
  }

  if (delta <= -4) {
    return 'FALLING';
  }

  return 'STEADY';
}

function resolvePosture(score: number): ThreatPosture {
  if (score >= 14) {
    return 'ELEVATED';
  }

  if (score >= 6) {
    return 'GUARDED';
  }

  return 'STABLE';
}

export class ThreatModelWorker {
  public summarize(
    history: AuditEntry[],
    driftAnalysis: DriftAnalysis,
    fingerprintPressure: FingerprintPressure
  ): IntelligenceSummary {
    const recentWindow = history.slice(-80);
    const severeActions = recentWindow.filter(
      (entry) => entry.action === 'QUARANTINE' || entry.action === 'BLOCK'
    ).length;
    const deceptionEvents = recentWindow.filter((entry) => entry.deceptionTriggered === true);
    const routeCounts = new Map<string, number>();
    for (const entry of deceptionEvents) {
      if (!entry.deceptionRoute) {
        continue;
      }
      routeCounts.set(entry.deceptionRoute, (routeCounts.get(entry.deceptionRoute) ?? 0) + 1);
    }

    const deceptionRouteHotspots = [...routeCounts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 5)
      .map(([route]) => route);

    const driftWeight = driftAnalysis.alerts.length * 2;
    const fingerprintWeight =
      fingerprintPressure.pressureLevel === 'HIGH'
        ? 6
        : fingerprintPressure.pressureLevel === 'MEDIUM'
          ? 3
          : 1;
    const deceptionWeight = deceptionEvents.length * 3 + deceptionRouteHotspots.length;
    const score = severeActions + driftWeight + fingerprintWeight + deceptionWeight;

    return {
      posture: resolvePosture(score),
      trend: resolveTrend(history),
      score,
      driftCount: driftAnalysis.alerts.length,
      topDriftAlerts: driftAnalysis.alerts.slice(0, 5),
      fingerprintSignals: fingerprintPressure.recentEvents,
      recurringFingerprintDomains: fingerprintPressure.recurringDomains,
      deceptionProbes: deceptionEvents.length,
      deceptionRouteHotspots,
      severeActions,
      modelVersion: 2,
      source: 'engine',
      updatedAt: Date.now()
    };
  }
}
