import type { AuditOutcome } from '../core/AuditLog.js';
import type { PolicyResult } from '../core/PolicyEngine.js';

type RegenerationLedger = Record<string, RegenerationLedgerEntry>;
type RegenerativeBlocklist = Record<string, RegenerativeBlockEntry>;

interface RegenerationLedgerEntry {
  key: string;
  domain: string;
  name: string;
  observations: number;
  regenerationEvents: number;
  removalActions: number;
  blockActions: number;
  lastObservedAt: number;
  lastRemovalAt?: number;
  lastRegeneratedAt?: number;
  permanentBlock: boolean;
  escalatedAt?: number;
}

interface RegenerativeBlockEntry {
  key: string;
  domain: string;
  name: string;
  reason: string;
  firstSeenAt: number;
  lastSeenAt: number;
  hits: number;
  permanentBlock: boolean;
}

interface ShieldStorageState {
  antiRegenerationEnabled?: boolean;
  aggressiveSetCookieStripEnabled?: boolean;
  regenerationEscalationThreshold?: number;
  regenerationLedger?: RegenerationLedger;
  regenerativeBlocklist?: RegenerativeBlocklist;
}

interface ObserveResult {
  forceBlock: boolean;
  signal?: string;
}

interface EnforcementUpdate {
  escalated: boolean;
  signal?: string;
}

const STORAGE_KEYS = [
  'antiRegenerationEnabled',
  'aggressiveSetCookieStripEnabled',
  'regenerationEscalationThreshold',
  'regenerationLedger',
  'regenerativeBlocklist'
] as const;

const DEFAULT_THRESHOLD = 2;
const MIN_THRESHOLD = 1;
const MAX_THRESHOLD = 20;
const RULE_ID_BASE = 870000;
const MAX_STRIP_RULES = 200;

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^\.+/, '');
}

function normalizeKey(domain: string, name: string): string {
  return `${normalizeDomain(domain)}|${name.trim().toLowerCase()}`;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clampThreshold(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_THRESHOLD;
  }

  return Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, Math.floor(value as number)));
}

export class RegenerationShieldWorker {
  private enabled = true;

  private aggressiveStripEnabled = true;

  private escalationThreshold = DEFAULT_THRESHOLD;

  private ledger: RegenerationLedger = {};

  private blocklist: RegenerativeBlocklist = {};

  private storageListenerAttached = false;

  public async init(): Promise<void> {
    const data = (await chrome.storage.local.get([...STORAGE_KEYS])) as ShieldStorageState;
    this.enabled = data.antiRegenerationEnabled !== false;
    this.aggressiveStripEnabled = data.aggressiveSetCookieStripEnabled !== false;
    this.escalationThreshold = clampThreshold(data.regenerationEscalationThreshold);
    this.ledger = data.regenerationLedger ?? {};
    this.blocklist = data.regenerativeBlocklist ?? {};

    await this.persistState();
    await this.syncSetCookieStripRules();
    this.attachStorageListener();
  }

  public async observe(cookie: chrome.cookies.Cookie): Promise<ObserveResult> {
    if (!this.enabled) {
      return { forceBlock: false };
    }

    const now = Date.now();
    const key = normalizeKey(cookie.domain, cookie.name);
    const entry = this.ensureLedgerEntry(key, cookie, now);

    entry.observations += 1;
    entry.lastObservedAt = now;

    if (typeof entry.lastRemovalAt === 'number' && now > entry.lastRemovalAt) {
      entry.regenerationEvents += 1;
      entry.lastRegeneratedAt = now;
    }

    const existingBlock = this.blocklist[key];
    if (existingBlock) {
      existingBlock.lastSeenAt = now;
      existingBlock.hits += 1;
      entry.permanentBlock = true;
      await this.persistState();
      return { forceBlock: true, signal: 'Regeneration denylist hit' };
    }

    if (
      !entry.permanentBlock &&
      (entry.regenerationEvents >= this.escalationThreshold ||
        entry.blockActions >= this.escalationThreshold)
    ) {
      entry.permanentBlock = true;
      entry.escalatedAt = now;
      this.blocklist[key] = this.buildBlocklistEntry(entry, 'Auto-escalated: regenerative cookie pattern');
      await this.persistState();
      await this.syncSetCookieStripRules();
      return { forceBlock: true, signal: 'Regeneration escalation: permanent block' };
    }

    await this.persistState();
    return { forceBlock: false };
  }

  public async recordEnforcement(
    cookie: chrome.cookies.Cookie,
    decision: PolicyResult,
    outcome: AuditOutcome
  ): Promise<EnforcementUpdate> {
    if (!this.enabled) {
      return { escalated: false };
    }

    const now = Date.now();
    const key = normalizeKey(cookie.domain, cookie.name);
    const entry = this.ensureLedgerEntry(key, cookie, now);

    if (
      outcome === 'REMOVED' ||
      outcome === 'REMOVED_AND_QUARANTINED' ||
      outcome === 'DECAY_EXECUTED'
    ) {
      entry.removalActions += 1;
      entry.lastRemovalAt = now;
    }

    if (decision.action === 'BLOCK' || decision.action === 'QUARANTINE') {
      entry.blockActions += 1;
    }

    let escalated = false;
    if (
      !entry.permanentBlock &&
      (entry.regenerationEvents >= this.escalationThreshold ||
        entry.blockActions >= this.escalationThreshold)
    ) {
      entry.permanentBlock = true;
      entry.escalatedAt = now;
      this.blocklist[key] = this.buildBlocklistEntry(
        entry,
        'Auto-escalated: repeated block/quarantine regeneration'
      );
      escalated = true;
    }

    await this.persistState();
    if (escalated) {
      await this.syncSetCookieStripRules();
      return {
        escalated: true,
        signal: `Regeneration escalation: ${entry.domain}/${entry.name} moved to permanent block`
      };
    }

    return { escalated: false };
  }

  public async recordDecayExecution(cookie: chrome.cookies.Cookie): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const now = Date.now();
    const key = normalizeKey(cookie.domain, cookie.name);
    const entry = this.ensureLedgerEntry(key, cookie, now);
    entry.removalActions += 1;
    entry.lastRemovalAt = now;
    await this.persistState();
  }

  private ensureLedgerEntry(
    key: string,
    cookie: chrome.cookies.Cookie,
    now: number
  ): RegenerationLedgerEntry {
    const existing = this.ledger[key];
    if (existing) {
      return existing;
    }

    const created: RegenerationLedgerEntry = {
      key,
      domain: normalizeDomain(cookie.domain),
      name: cookie.name,
      observations: 0,
      regenerationEvents: 0,
      removalActions: 0,
      blockActions: 0,
      lastObservedAt: now,
      permanentBlock: false
    };
    this.ledger[key] = created;
    return created;
  }

  private buildBlocklistEntry(entry: RegenerationLedgerEntry, reason: string): RegenerativeBlockEntry {
    const now = Date.now();
    return {
      key: entry.key,
      domain: entry.domain,
      name: entry.name,
      reason,
      firstSeenAt: entry.lastObservedAt || now,
      lastSeenAt: now,
      hits: Math.max(entry.regenerationEvents, entry.blockActions, 1),
      permanentBlock: true
    };
  }

  private async persistState(): Promise<void> {
    await chrome.storage.local.set({
      antiRegenerationEnabled: this.enabled,
      aggressiveSetCookieStripEnabled: this.aggressiveStripEnabled,
      regenerationEscalationThreshold: this.escalationThreshold,
      regenerationLedger: this.ledger,
      regenerativeBlocklist: this.blocklist
    });
  }

  private attachStorageListener(): void {
    if (this.storageListenerAttached) {
      return;
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') {
        return;
      }

      let needsRuleSync = false;
      let needsPersist = false;

      if (changes.antiRegenerationEnabled) {
        this.enabled = changes.antiRegenerationEnabled.newValue !== false;
        needsPersist = true;
      }

      if (changes.aggressiveSetCookieStripEnabled) {
        this.aggressiveStripEnabled = changes.aggressiveSetCookieStripEnabled.newValue !== false;
        needsRuleSync = true;
        needsPersist = true;
      }

      if (changes.regenerationEscalationThreshold) {
        this.escalationThreshold = clampThreshold(
          Number(changes.regenerationEscalationThreshold.newValue)
        );
        needsPersist = true;
      }

      if (changes.regenerativeBlocklist) {
        this.blocklist = (changes.regenerativeBlocklist.newValue as RegenerativeBlocklist) ?? {};
        needsRuleSync = true;
      }

      if (changes.regenerationLedger) {
        this.ledger = (changes.regenerationLedger.newValue as RegenerationLedger) ?? {};
      }

      if (needsPersist) {
        void this.persistState();
      }
      if (needsRuleSync) {
        void this.syncSetCookieStripRules();
      }
    });

    this.storageListenerAttached = true;
  }

  private async syncSetCookieStripRules(): Promise<void> {
    if (!chrome.declarativeNetRequest) {
      return;
    }

    const ruleIds = await this.getManagedDynamicRuleIds();

    if (!this.aggressiveStripEnabled || !this.enabled) {
      if (ruleIds.length === 0) {
        return;
      }

      await this.updateDynamicRules(ruleIds, []);
      return;
    }

    const domains = Array.from(
      new Set(Object.values(this.blocklist).map((entry) => normalizeDomain(entry.domain)))
    )
      .filter((domain) => domain.length > 0)
      .slice(0, MAX_STRIP_RULES);

    const rules: chrome.declarativeNetRequest.Rule[] = domains.map((domain, index) => ({
      id: RULE_ID_BASE + index,
      priority: 1,
      action: {
        type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
        responseHeaders: [
          {
            header: 'set-cookie',
            operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE
          }
        ]
      },
      condition: {
        regexFilter: `^https?:\\/\\/([^\\/]+\\.)?${escapeRegex(domain)}\\/`,
        resourceTypes: [
          chrome.declarativeNetRequest.ResourceType.MAIN_FRAME,
          chrome.declarativeNetRequest.ResourceType.SUB_FRAME,
          chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
          chrome.declarativeNetRequest.ResourceType.SCRIPT,
          chrome.declarativeNetRequest.ResourceType.IMAGE,
          chrome.declarativeNetRequest.ResourceType.FONT,
          chrome.declarativeNetRequest.ResourceType.STYLESHEET,
          chrome.declarativeNetRequest.ResourceType.MEDIA,
          chrome.declarativeNetRequest.ResourceType.OTHER
        ]
      }
    }));

    await this.updateDynamicRules(ruleIds, rules);
  }

  private async getManagedDynamicRuleIds(): Promise<number[]> {
    if (!chrome.declarativeNetRequest || !chrome.declarativeNetRequest.getDynamicRules) {
      return [];
    }

    const rules = await new Promise<chrome.declarativeNetRequest.Rule[]>((resolve) => {
      chrome.declarativeNetRequest.getDynamicRules((items) => resolve(items ?? []));
    });

    return rules
      .map((rule) => rule.id)
      .filter((id) => id >= RULE_ID_BASE && id < RULE_ID_BASE + MAX_STRIP_RULES);
  }

  private async updateDynamicRules(
    removeRuleIds: number[],
    addRules: chrome.declarativeNetRequest.Rule[]
  ): Promise<void> {
    if (!chrome.declarativeNetRequest || !chrome.declarativeNetRequest.updateDynamicRules) {
      return;
    }

    await new Promise<void>((resolve) => {
      chrome.declarativeNetRequest.updateDynamicRules(
        {
          removeRuleIds,
          addRules
        },
        () => {
          if (chrome.runtime?.lastError) {
            console.warn(
              'RegenerationShieldWorker dynamic rule update failed:',
              chrome.runtime.lastError.message
            );
          }
          resolve();
        }
      );
    });
  }
}
