import { JarType } from '../workers/CookieJarWorker.js';

export type PolicyDecision = 'ALLOW' | 'BLOCK' | 'QUARANTINE' | 'DECAY';
export type PolicyMode = 'STRICT' | 'BALANCED';

export interface PolicyResult {
  action: PolicyDecision;
  reason: string;
  targetJar?: JarType;
}

interface PolicySettings {
  userAllowlist?: string[];
  policyMode?: string;
}

export class PolicyEngine {
  private userAllowlist: string[] = [];

  private mode: PolicyMode = 'BALANCED';

  private readonly trackingSignatures = ['_ga', '_gid', '_fbp', 'uid', 'tracker', 'ads'];

  private readonly essentialSignatures = ['session', 'auth', 'token', 'csrf'];

  public async init(): Promise<void> {
    const stored = (await chrome.storage.local.get([
      'userAllowlist',
      'policyMode'
    ])) as PolicySettings;

    this.userAllowlist = Array.isArray(stored.userAllowlist)
      ? stored.userAllowlist.filter((domain) => typeof domain === 'string')
      : [];

    if (stored.policyMode === 'STRICT' || stored.policyMode === 'BALANCED') {
      this.mode = stored.policyMode;
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

    return {
      action: this.mode === 'STRICT' ? 'QUARANTINE' : 'DECAY',
      reason: this.mode === 'STRICT' ? 'Policy: Unknown Cookie (Strict)' : 'Policy: Unknown Cookie (Decay)',
      targetJar: JarType.QUARANTINE
    };
  }
}
