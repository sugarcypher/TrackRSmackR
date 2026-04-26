import type { PolicyDecision } from './PolicyEngine.js';
import type { JarType } from '../workers/CookieJarWorker.js';

export type AuditEventType = 'COOKIE_DECISION' | 'DECAY_EXECUTION';

export type AuditOutcome =
  | 'ALLOWED'
  | 'ALLOWED_VAULTED'
  | 'REMOVED'
  | 'REMOVED_AND_QUARANTINED'
  | 'DECAY_PENDING'
  | 'DECAY_EXECUTED'
  | 'GINGERBREAD_SUBSTITUTED'
  | 'SESSION_APPROVED';

export interface AuditEntry {
  timestamp: number;
  domain: string;
  name: string;
  action: PolicyDecision;
  reason: string;
  eventType: AuditEventType;
  policyReason?: string;
  explanation?: string;
  targetJar?: JarType | 'NONE';
  adaptationSignals?: string[];
  confidence?: number;
  outcome?: AuditOutcome;
  driftKey?: string;
}

export class AuditLog {
  private static readonly MAX_ENTRIES = 1_000;

  public async log(entry: AuditEntry): Promise<void> {
    const data = (await chrome.storage.local.get('auditLog')) as { auditLog?: AuditEntry[] };
    const log = data.auditLog ?? [];

    log.push(entry);

    if (log.length > AuditLog.MAX_ENTRIES) {
      log.shift();
    }

    await chrome.storage.local.set({ auditLog: log });
  }

  public async getHistory(): Promise<AuditEntry[]> {
    const data = (await chrome.storage.local.get('auditLog')) as { auditLog?: AuditEntry[] };
    return data.auditLog ?? [];
  }
}
