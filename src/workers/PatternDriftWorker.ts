import type { AuditEntry } from '../core/AuditLog.js';
import type { DriftAlert, DriftAnalysis } from '../core/IntelligenceTypes.js';

interface DriftConfig {
  recentWindowSize: number;
  baselineWindowSize: number;
  minRecent: number;
  minDelta: number;
}

const DEFAULT_CONFIG: DriftConfig = {
  recentWindowSize: 80,
  baselineWindowSize: 80,
  minRecent: 2,
  minDelta: 2
};

function makeDriftKey(entry: AuditEntry): string {
  if (entry.driftKey && entry.driftKey.length > 0) {
    return entry.driftKey;
  }

  const signalKey =
    entry.adaptationSignals && entry.adaptationSignals.length > 0
      ? [...entry.adaptationSignals].sort().join('+').toLowerCase()
      : 'none';

  return `${entry.domain}|${entry.action}|${signalKey}`;
}

function countByKey(entries: AuditEntry[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const entry of entries) {
    const key = makeDriftKey(entry);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

function parseDriftKey(key: string): { domain: string; action: string; signalKey: string } {
  const [domain = 'unknown', action = 'UNKNOWN', signalKey = 'none'] = key.split('|');
  return { domain, action, signalKey };
}

export class PatternDriftWorker {
  public analyze(history: AuditEntry[], config: Partial<DriftConfig> = {}): DriftAnalysis {
    const effectiveConfig: DriftConfig = {
      ...DEFAULT_CONFIG,
      ...config
    };

    const recentWindow = history.slice(-effectiveConfig.recentWindowSize);
    const baselineWindow = history.slice(
      Math.max(0, history.length - effectiveConfig.recentWindowSize - effectiveConfig.baselineWindowSize),
      Math.max(0, history.length - effectiveConfig.recentWindowSize)
    );

    const recentCounts = countByKey(recentWindow);
    const baselineCounts = countByKey(baselineWindow);
    const alerts: DriftAlert[] = [];

    for (const [key, recentCount] of recentCounts.entries()) {
      const baselineCount = baselineCounts.get(key) ?? 0;
      const delta = recentCount - baselineCount;

      if (recentCount >= effectiveConfig.minRecent && delta >= effectiveConfig.minDelta) {
        const parsed = parseDriftKey(key);
        alerts.push({
          key,
          domain: parsed.domain,
          action: parsed.action,
          signalKey: parsed.signalKey,
          delta,
          recentCount,
          baselineCount
        });
      }
    }

    alerts.sort((a, b) => b.delta - a.delta || b.recentCount - a.recentCount);

    return {
      alerts,
      distinctRecentPatterns: recentCounts.size,
      recentWindowSize: recentWindow.length,
      baselineWindowSize: baselineWindow.length
    };
  }
}
