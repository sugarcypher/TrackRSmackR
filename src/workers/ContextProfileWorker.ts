import type { PolicyMode } from '../core/PolicyEngine.js';

export type ContextCategory = 'BANKING' | 'SHOPPING' | 'NEWS' | 'GENERAL';
export type ContextSensitivity = 'LOW' | 'MEDIUM' | 'HIGH';
export type ContextBreakagePressure = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';

export interface ContextPolicyRule {
  pattern: string;
  mode: PolicyMode;
  label?: string;
}

interface ContextSensitivityRecord {
  sensitivity: ContextSensitivity;
  source: string;
  matchedFields?: string[];
  updatedAt: number;
}

interface ContextBreakageRecord {
  score: number;
  scriptErrors: number;
  rejectedPromises: number;
  resourceFailures: number;
  rageClicks: number;
  lastSignalAt: number;
  updatedAt: number;
}

interface ContextStorageState {
  contextPolicyEnabled?: boolean;
  contextPolicyRules?: ContextPolicyRule[];
  contextSensitivityMap?: Record<string, ContextSensitivityRecord>;
  contextBreakageAdaptiveEnabled?: boolean;
  contextBreakageRelaxThreshold?: number;
  contextBreakageMap?: Record<string, ContextBreakageRecord>;
}

export interface ContextResolution {
  mode: PolicyMode;
  reason: string;
  category: ContextCategory;
  source: 'base' | 'rule' | 'sensitivity' | 'heuristic' | 'breakage';
  sensitivity?: ContextSensitivity;
  breakageScore?: number;
  breakagePressure?: ContextBreakagePressure;
}

interface ResolvedBreakage {
  score: number;
  pressure: ContextBreakagePressure;
  lastSignalAt: number;
}

const STORAGE_KEYS = [
  'contextPolicyEnabled',
  'contextPolicyRules',
  'contextSensitivityMap',
  'contextBreakageAdaptiveEnabled',
  'contextBreakageRelaxThreshold',
  'contextBreakageMap'
] as const;
const BREAKAGE_DECAY_WINDOW_MS = 6 * 60 * 60 * 1000;
const BREAKAGE_STALE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const MIN_BREAKAGE_THRESHOLD = 2;
const MAX_BREAKAGE_THRESHOLD = 20;

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^\.+/, '');
}

function normalizeRules(raw: unknown): ContextPolicyRule[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((item): item is ContextPolicyRule => {
      if (!item || typeof item !== 'object') {
        return false;
      }
      const typed = item as ContextPolicyRule;
      return (
        typeof typed.pattern === 'string' &&
        typed.pattern.trim().length > 0 &&
        (typed.mode === 'STRICT' || typed.mode === 'BALANCED')
      );
    })
    .map((item) => ({
      pattern: normalizeDomain(item.pattern),
      mode: item.mode,
      label: typeof item.label === 'string' ? item.label : undefined
    }));
}

function normalizeBreakageThreshold(raw: unknown): number {
  if (typeof raw !== 'number' || Number.isNaN(raw)) {
    return 4;
  }

  const threshold = Math.round(raw);
  return Math.min(Math.max(threshold, MIN_BREAKAGE_THRESHOLD), MAX_BREAKAGE_THRESHOLD);
}

function normalizeBreakageMap(raw: unknown): Record<string, ContextBreakageRecord> {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const normalized: Record<string, ContextBreakageRecord> = {};
  for (const [host, value] of Object.entries(raw)) {
    if (!value || typeof value !== 'object') {
      continue;
    }

    const typed = value as Partial<ContextBreakageRecord>;
    if (
      typeof typed.score !== 'number' ||
      typeof typed.lastSignalAt !== 'number' ||
      typeof typed.updatedAt !== 'number'
    ) {
      continue;
    }

    normalized[normalizeDomain(host)] = {
      score: Math.max(0, typed.score),
      scriptErrors: Math.max(0, typed.scriptErrors ?? 0),
      rejectedPromises: Math.max(0, typed.rejectedPromises ?? 0),
      resourceFailures: Math.max(0, typed.resourceFailures ?? 0),
      rageClicks: Math.max(0, typed.rageClicks ?? 0),
      lastSignalAt: typed.lastSignalAt,
      updatedAt: typed.updatedAt
    };
  }

  return normalized;
}

function contextCategoryForDomain(domain: string): ContextCategory {
  const normalized = normalizeDomain(domain);

  if (/(?:\bbank\b|credit|loan|finance|brokerage|payments|paypal|stripe|wallet)/i.test(normalized)) {
    return 'BANKING';
  }

  if (/(?:shop|store|cart|checkout|market|retail|amazon|ebay)/i.test(normalized)) {
    return 'SHOPPING';
  }

  if (/(?:news|times|post|journal|media|press)/i.test(normalized)) {
    return 'NEWS';
  }

  return 'GENERAL';
}

function ruleMatchesDomain(pattern: string, domain: string): boolean {
  const normalizedPattern = normalizeDomain(pattern);
  const normalizedDomain = normalizeDomain(domain);

  if (normalizedPattern.startsWith('*.')) {
    const suffix = normalizedPattern.slice(2);
    return normalizedDomain === suffix || normalizedDomain.endsWith(`.${suffix}`);
  }

  if (normalizedPattern.startsWith('.')) {
    const suffix = normalizedPattern.slice(1);
    return normalizedDomain === suffix || normalizedDomain.endsWith(`.${suffix}`);
  }

  return normalizedDomain === normalizedPattern || normalizedDomain.endsWith(`.${normalizedPattern}`);
}

function sensitivityRank(sensitivity: ContextSensitivity): number {
  if (sensitivity === 'HIGH') {
    return 3;
  }

  if (sensitivity === 'MEDIUM') {
    return 2;
  }

  return 1;
}

function breakagePressureForScore(score: number, threshold: number): ContextBreakagePressure {
  if (score <= 0) {
    return 'NONE';
  }

  if (score >= threshold * 2) {
    return 'HIGH';
  }

  if (score >= threshold) {
    return 'MEDIUM';
  }

  if (score >= Math.max(MIN_BREAKAGE_THRESHOLD, threshold - 2)) {
    return 'LOW';
  }

  return 'NONE';
}

export class ContextProfileWorker {
  private enabled = true;

  private rules: ContextPolicyRule[] = [];

  private sensitivityMap: Record<string, ContextSensitivityRecord> = {};

  private breakageAdaptiveEnabled = true;

  private breakageRelaxThreshold = 4;

  private breakageMap: Record<string, ContextBreakageRecord> = {};

  private listenerAttached = false;

  public async init(): Promise<void> {
    const state = (await chrome.storage.local.get([...STORAGE_KEYS])) as ContextStorageState;
    this.enabled = state.contextPolicyEnabled !== false;
    this.rules = normalizeRules(state.contextPolicyRules);
    this.sensitivityMap = state.contextSensitivityMap ?? {};
    this.breakageAdaptiveEnabled = state.contextBreakageAdaptiveEnabled !== false;
    this.breakageRelaxThreshold = normalizeBreakageThreshold(state.contextBreakageRelaxThreshold);
    this.breakageMap = normalizeBreakageMap(state.contextBreakageMap);

    await this.persist();
    this.attachListener();
  }

  public resolve(cookieDomain: string, baseMode: PolicyMode): ContextResolution {
    const normalizedDomain = normalizeDomain(cookieDomain);
    const category = contextCategoryForDomain(normalizedDomain);
    const sensitivity = this.resolveSensitivity(normalizedDomain);
    const breakage = this.resolveBreakage(normalizedDomain);

    if (!this.enabled) {
      return {
        mode: baseMode,
        reason: 'Context policy disabled',
        category,
        source: 'base',
        sensitivity,
        breakageScore: breakage?.score,
        breakagePressure: breakage?.pressure
      };
    }

    const matchedRule = this.rules.find((rule) => ruleMatchesDomain(rule.pattern, normalizedDomain));
    let resolution: ContextResolution;
    if (matchedRule) {
      resolution = {
        mode: matchedRule.mode,
        reason: matchedRule.label
          ? `User rule (${matchedRule.label})`
          : `User rule (${matchedRule.pattern} -> ${matchedRule.mode})`,
        category,
        source: 'rule'
      };
    } else if (sensitivity === 'HIGH') {
      resolution = {
        mode: 'STRICT',
        reason: 'Sensitive context inferred from local form signals',
        category,
        source: 'sensitivity',
        sensitivity
      };
    } else if (category === 'BANKING') {
      resolution = {
        mode: 'STRICT',
        reason: 'Heuristic context: banking/finance domain',
        category,
        source: 'heuristic',
        sensitivity
      };
    } else if (category === 'NEWS') {
      resolution = {
        mode: 'STRICT',
        reason: 'Heuristic context: news/media domain',
        category,
        source: 'heuristic',
        sensitivity
      };
    } else if (category === 'SHOPPING') {
      resolution = {
        mode: 'BALANCED',
        reason: 'Heuristic context: shopping domain',
        category,
        source: 'heuristic',
        sensitivity
      };
    } else {
      resolution = {
        mode: baseMode,
        reason: 'Default context profile',
        category,
        source: 'base',
        sensitivity
      };
    }

    if (breakage && this.shouldRelaxForBreakage(resolution, breakage)) {
      return {
        ...resolution,
        mode: 'BALANCED',
        source: 'breakage',
        reason: `Breakage budget relief (${breakage.pressure.toLowerCase()} pressure): ${resolution.reason}`,
        breakageScore: breakage.score,
        breakagePressure: breakage.pressure
      };
    }

    return {
      ...resolution,
      breakageScore: breakage?.score,
      breakagePressure: breakage?.pressure
    };
  }

  public setStateForTesting(state: {
    enabled?: boolean;
    rules?: ContextPolicyRule[];
    sensitivityMap?: Record<string, ContextSensitivityRecord>;
    breakageAdaptiveEnabled?: boolean;
    breakageRelaxThreshold?: number;
    breakageMap?: Record<string, ContextBreakageRecord>;
  }): void {
    if (typeof state.enabled === 'boolean') {
      this.enabled = state.enabled;
    }

    if (state.rules) {
      this.rules = normalizeRules(state.rules);
    }

    if (state.sensitivityMap) {
      this.sensitivityMap = state.sensitivityMap;
    }

    if (typeof state.breakageAdaptiveEnabled === 'boolean') {
      this.breakageAdaptiveEnabled = state.breakageAdaptiveEnabled;
    }

    if (typeof state.breakageRelaxThreshold === 'number') {
      this.breakageRelaxThreshold = normalizeBreakageThreshold(state.breakageRelaxThreshold);
    }

    if (state.breakageMap) {
      this.breakageMap = normalizeBreakageMap(state.breakageMap);
    }
  }

  private resolveSensitivity(domain: string): ContextSensitivity | undefined {
    let best: ContextSensitivity | undefined;

    for (const [host, record] of Object.entries(this.sensitivityMap)) {
      const normalizedHost = normalizeDomain(host);
      if (domain === normalizedHost || domain.endsWith(`.${normalizedHost}`)) {
        if (!best || sensitivityRank(record.sensitivity) > sensitivityRank(best)) {
          best = record.sensitivity;
        }
      }
    }

    return best;
  }

  private resolveBreakage(domain: string): ResolvedBreakage | undefined {
    let winner: ResolvedBreakage | undefined;
    const now = Date.now();

    for (const [host, record] of Object.entries(this.breakageMap)) {
      const normalizedHost = normalizeDomain(host);
      if (!(domain === normalizedHost || domain.endsWith(`.${normalizedHost}`))) {
        continue;
      }

      const elapsed = Math.max(0, now - record.lastSignalAt);
      if (elapsed > BREAKAGE_STALE_WINDOW_MS) {
        continue;
      }

      const decaySteps = Math.floor(elapsed / BREAKAGE_DECAY_WINDOW_MS);
      const decayedScore = Math.max(0, Math.round(record.score) - decaySteps);
      if (decayedScore <= 0) {
        continue;
      }

      const candidate: ResolvedBreakage = {
        score: decayedScore,
        pressure: breakagePressureForScore(decayedScore, this.breakageRelaxThreshold),
        lastSignalAt: record.lastSignalAt
      };

      if (
        !winner ||
        candidate.score > winner.score ||
        (candidate.score === winner.score && candidate.lastSignalAt > winner.lastSignalAt)
      ) {
        winner = candidate;
      }
    }

    return winner;
  }

  private shouldRelaxForBreakage(
    resolution: ContextResolution,
    breakage?: ResolvedBreakage
  ): boolean {
    if (!this.breakageAdaptiveEnabled || !breakage) {
      return false;
    }

    if (breakage.pressure === 'NONE' || breakage.score < this.breakageRelaxThreshold) {
      return false;
    }

    if (resolution.mode !== 'STRICT') {
      return false;
    }

    if (resolution.source === 'rule' || resolution.source === 'sensitivity') {
      return false;
    }

    if (resolution.sensitivity === 'HIGH') {
      return false;
    }

    return true;
  }

  private attachListener(): void {
    if (this.listenerAttached) {
      return;
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') {
        return;
      }

      if (changes.contextPolicyEnabled) {
        this.enabled = changes.contextPolicyEnabled.newValue !== false;
      }

      if (changes.contextPolicyRules) {
        this.rules = normalizeRules(changes.contextPolicyRules.newValue);
      }

      if (changes.contextSensitivityMap) {
        this.sensitivityMap =
          (changes.contextSensitivityMap.newValue as Record<string, ContextSensitivityRecord>) ?? {};
      }

      if (changes.contextBreakageAdaptiveEnabled) {
        this.breakageAdaptiveEnabled = changes.contextBreakageAdaptiveEnabled.newValue !== false;
      }

      if (changes.contextBreakageRelaxThreshold) {
        this.breakageRelaxThreshold = normalizeBreakageThreshold(changes.contextBreakageRelaxThreshold.newValue);
      }

      if (changes.contextBreakageMap) {
        this.breakageMap = normalizeBreakageMap(changes.contextBreakageMap.newValue);
      }

      void this.persist();
    });

    this.listenerAttached = true;
  }

  private async persist(): Promise<void> {
    await chrome.storage.local.set({
      contextPolicyEnabled: this.enabled,
      contextPolicyRules: this.rules,
      contextSensitivityMap: this.sensitivityMap,
      contextBreakageAdaptiveEnabled: this.breakageAdaptiveEnabled,
      contextBreakageRelaxThreshold: this.breakageRelaxThreshold,
      contextBreakageMap: this.breakageMap
    });
  }
}
