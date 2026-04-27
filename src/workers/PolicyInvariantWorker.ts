import type { PolicyMode, PolicyResult } from '../core/PolicyEngine.js';
import { JarType } from './CookieJarWorker.js';

interface InvariantStorageState {
  policyInvariantFloorMode?: PolicyMode;
  policyInvariantDomainBlocklist?: string[];
  policyInvariantEnforcePersona?: boolean;
  uniformPersonaEnabled?: boolean;
  personaEntropyNormalizationEnabled?: boolean;
  personaScriptBlocklistEnabled?: boolean;
}

export interface PolicyInvariantResult {
  decision: PolicyResult;
  signals: string[];
}

const STORAGE_KEYS = [
  'policyInvariantFloorMode',
  'policyInvariantDomainBlocklist',
  'policyInvariantEnforcePersona',
  'uniformPersonaEnabled',
  'personaEntropyNormalizationEnabled',
  'personaScriptBlocklistEnabled'
] as const;

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^\.+/, '');
}

function normalizeBlocklist(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return Array.from(
    new Set(
      raw
        .filter((value): value is string => typeof value === 'string')
        .map((value) => normalizeDomain(value))
        .filter((value) => value.length > 0)
    )
  );
}

function domainMatches(domain: string, pattern: string): boolean {
  const normalizedDomain = normalizeDomain(domain);
  const normalizedPattern = normalizeDomain(pattern);
  return (
    normalizedDomain === normalizedPattern ||
    normalizedDomain.endsWith(`.${normalizedPattern}`) ||
    normalizedPattern.endsWith(`.${normalizedDomain}`)
  );
}

export class PolicyInvariantWorker {
  private floorMode: PolicyMode = 'BALANCED';

  private blocklist: string[] = [];

  private enforcePersona = true;

  private listenerAttached = false;

  public async init(): Promise<void> {
    const state = (await chrome.storage.local.get([...STORAGE_KEYS])) as InvariantStorageState;

    this.floorMode = state.policyInvariantFloorMode === 'STRICT' ? 'STRICT' : 'BALANCED';
    this.blocklist = normalizeBlocklist(state.policyInvariantDomainBlocklist);
    this.enforcePersona = state.policyInvariantEnforcePersona !== false;

    await this.persist();
    await this.enforcePersonaInvariants(state);
    this.attachListener();
  }

  public apply(cookie: chrome.cookies.Cookie, decision: PolicyResult): PolicyInvariantResult {
    let nextDecision = decision;
    const signals: string[] = [];

    if (this.blocklist.some((pattern) => domainMatches(cookie.domain, pattern))) {
      nextDecision = {
        action: 'QUARANTINE',
        reason: 'Policy invariant: domain blocklist enforcement',
        targetJar: JarType.QUARANTINE
      };
      signals.push('Policy invariant: domain blocklist');
    }

    if (this.floorMode === 'STRICT' && nextDecision.action === 'DECAY') {
      nextDecision = {
        action: 'QUARANTINE',
        reason: 'Policy invariant: strict floor mode',
        targetJar: JarType.QUARANTINE
      };
      signals.push('Policy invariant: strict floor');
    }

    return {
      decision: nextDecision,
      signals
    };
  }

  public getFloorMode(): PolicyMode {
    return this.floorMode;
  }

  public setStateForTesting(state: {
    floorMode?: PolicyMode;
    blocklist?: string[];
    enforcePersona?: boolean;
  }): void {
    if (state.floorMode) {
      this.floorMode = state.floorMode;
    }
    if (state.blocklist) {
      this.blocklist = normalizeBlocklist(state.blocklist);
    }
    if (typeof state.enforcePersona === 'boolean') {
      this.enforcePersona = state.enforcePersona;
    }
  }

  private async enforcePersonaInvariants(state: InvariantStorageState): Promise<void> {
    if (!this.enforcePersona) {
      return;
    }

    const updates: Record<string, unknown> = {};

    if (state.uniformPersonaEnabled === false) {
      updates.uniformPersonaEnabled = true;
    }

    if (state.personaEntropyNormalizationEnabled === false) {
      updates.personaEntropyNormalizationEnabled = true;
    }

    if (state.personaScriptBlocklistEnabled === false) {
      updates.personaScriptBlocklistEnabled = true;
    }

    if (Object.keys(updates).length > 0) {
      await chrome.storage.local.set(updates);
    }
  }

  private attachListener(): void {
    if (this.listenerAttached) {
      return;
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') {
        return;
      }

      if (changes.policyInvariantFloorMode) {
        const value = changes.policyInvariantFloorMode.newValue;
        this.floorMode = value === 'STRICT' ? 'STRICT' : 'BALANCED';
      }

      if (changes.policyInvariantDomainBlocklist) {
        this.blocklist = normalizeBlocklist(changes.policyInvariantDomainBlocklist.newValue);
      }

      if (changes.policyInvariantEnforcePersona) {
        this.enforcePersona = changes.policyInvariantEnforcePersona.newValue !== false;
      }

      if (
        this.enforcePersona &&
        (changes.uniformPersonaEnabled ||
          changes.personaEntropyNormalizationEnabled ||
          changes.personaScriptBlocklistEnabled)
      ) {
        void this.enforcePersonaInvariants({
          uniformPersonaEnabled: changes.uniformPersonaEnabled?.newValue as boolean | undefined,
          personaEntropyNormalizationEnabled: changes.personaEntropyNormalizationEnabled
            ?.newValue as boolean | undefined,
          personaScriptBlocklistEnabled: changes.personaScriptBlocklistEnabled
            ?.newValue as boolean | undefined
        });
      }

      void this.persist();
    });

    this.listenerAttached = true;
  }

  private async persist(): Promise<void> {
    await chrome.storage.local.set({
      policyInvariantFloorMode: this.floorMode,
      policyInvariantDomainBlocklist: this.blocklist,
      policyInvariantEnforcePersona: this.enforcePersona
    });
  }
}
