import type { AuditEntry } from '../core/AuditLog.js';
import type { FingerprintPressure } from '../core/IntelligenceTypes.js';

function hasFingerprintSignal(entry: AuditEntry): boolean {
  return (entry.adaptationSignals ?? []).some((signal) =>
    /fingerprint|hex-like|\bfp\b/i.test(signal)
  );
}

export class BehavioralFingerprintWorker {
  public analyze(history: AuditEntry[]): FingerprintPressure {
    const recentWindow = history.slice(-80);
    const fingerprintEntries = history.filter(hasFingerprintSignal);
    const recentFingerprintEntries = recentWindow.filter(hasFingerprintSignal);

    const domainCounts = new Map<string, number>();
    for (const entry of recentFingerprintEntries) {
      domainCounts.set(entry.domain, (domainCounts.get(entry.domain) ?? 0) + 1);
    }

    const recurringDomains = [...domainCounts.entries()]
      .filter(([, count]) => count >= 2)
      .map(([domain]) => domain)
      .sort();

    const pressureLevel: FingerprintPressure['pressureLevel'] =
      recentFingerprintEntries.length >= 8 || recurringDomains.length >= 3
        ? 'HIGH'
        : recentFingerprintEntries.length >= 3 || recurringDomains.length >= 1
          ? 'MEDIUM'
          : 'LOW';

    return {
      totalEvents: fingerprintEntries.length,
      recentEvents: recentFingerprintEntries.length,
      recurringDomains,
      pressureLevel
    };
  }
}
