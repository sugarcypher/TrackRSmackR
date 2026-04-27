import { JarType } from '../workers/CookieJarWorker.js';

export type PolicyDecision = 'ALLOW' | 'BLOCK' | 'QUARANTINE' | 'DECAY';
export type PolicyMode = 'STRICT' | 'BALANCED' | 'PERMISSIVE';

export interface PolicyResult {
  action: PolicyDecision;
  reason: string;
  targetJar?: JarType;
}

interface PolicySettings {
  userAllowlist?: unknown;
  policyMode?: unknown;
  allowlist?: unknown;
  mode?: unknown;
}

function normalizeMode(value: unknown): PolicyMode | null {
  if (typeof value !== 'string') {
    return null;
  }
  const upper = value.toUpperCase();
  if (upper === 'STRICT' || upper === 'BALANCED' || upper === 'PERMISSIVE') {
    return upper;
  }
  return null;
}

function normalizeAllowlist(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry) => typeof entry === 'string').map((entry) => (entry as string).trim().toLowerCase())
    : [];
}

export class PolicyEngine {
  private userAllowlist: string[] = [];

  private mode: PolicyMode = 'BALANCED';

  private readonly trackingSignatures = ['_ga', '_gid', '_fbp', 'uid', 'tracker', 'ads'];

  private readonly essentialSignatures = ['session', 'auth', 'token', 'csrf'];

  public async init(): Promise<void> {
    const stored = (await chrome.storage.local.get([
      'userAllowlist',
      'policyMode',
      'allowlist',
      'mode'
    ])) as PolicySettings;

    const fromUser = normalizeAllowlist(stored.userAllowlist);
    const fromOnboarding = normalizeAllowlist(stored.allowlist);
    this.userAllowlist = Array.from(new Set([...fromUser, ...fromOnboarding]));

    const fromMode = normalizeMode(stored.mode) ?? normalizeMode(stored.policyMode);
    if (fromMode) {
      this.mode = fromMode;
    }
  }

  public setModeForTesting(mode: PolicyMode): void {
    this.mode = mode;
  }

  public setAllowlistForTesting(domains: string[]): void {
    this.userAllowlist = [...domains];
  }

  public evaluate(cookie: chrome.cookies.Cookie): PolicyResult {
    const lowerName = cookie.name.toLowerCase();
    const lowerDomain = cookie.domain.toLowerCase();

    if (
      this.userAllowlist.some((domain) =>
        lowerDomain.includes(domain.trim().toLowerCase())
      )
    ) {
      return {
        action: 'ALLOW',
        reason: 'User Allowlisted',
        targetJar: JarType.VAULT
      };
    }

    if (this.essentialSignatures.some((sig) => lowerName.includes(sig))) {
      return {
        action: 'ALLOW',
        reason: 'Heuristic: Essential Session/Auth',
        targetJar: JarType.VAULT
      };
    }

    if (this.trackingSignatures.some((sig) => lowerName.includes(sig))) {
      return {
        action: 'QUARANTINE',
        reason: 'Signature Match: Known Tracker',
        targetJar: JarType.QUARANTINE
      };
    }

    if (this.mode === 'STRICT') {
      return {
        action: 'QUARANTINE',
        reason: 'Policy: Unknown Cookie (Strict)',
        targetJar: JarType.QUARANTINE
      };
    }

    if (this.mode === 'PERMISSIVE') {
      return {
        action: 'ALLOW',
        reason: 'Policy: Unknown Cookie (Permissive Observe)',
        targetJar: JarType.VAULT
      };
    }

    return {
      action: 'DECAY',
      reason: 'Policy: Unknown Cookie (Decay)',
      targetJar: JarType.QUARANTINE
    };
  }
}
