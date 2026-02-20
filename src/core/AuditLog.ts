export interface AuditEntry {
  timestamp: number;
  domain: string;
  name: string;
  action: string;
  reason: string;
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
