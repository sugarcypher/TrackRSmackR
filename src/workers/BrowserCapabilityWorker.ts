import type { BrowserCompatibilitySnapshot, BrowserReadiness } from '../core/IntelligenceTypes.js';

interface BrowserCapabilityInput {
  userAgent?: string;
  manifestVersion?: number | null;
  cookiesApi?: boolean;
  storageApi?: boolean;
  alarmsApi?: boolean;
}

function detectFamily(userAgent: string): BrowserCompatibilitySnapshot['browserFamily'] {
  if (/firefox\//i.test(userAgent)) {
    return 'FIREFOX';
  }

  if (/edg\//i.test(userAgent)) {
    return 'EDGE';
  }

  if (/safari\//i.test(userAgent) && !/chrome\//i.test(userAgent)) {
    return 'SAFARI';
  }

  if (/chrome\//i.test(userAgent) || /chromium/i.test(userAgent)) {
    return 'CHROMIUM';
  }

  return 'UNKNOWN';
}

function resolveReadiness(score: number, warnings: string[]): BrowserReadiness {
  if (score >= 90 && warnings.length === 0) {
    return 'READY';
  }

  if (score >= 65) {
    return 'PARTIAL';
  }

  return 'RISK';
}

export class BrowserCapabilityWorker {
  public inspect(input: BrowserCapabilityInput = {}): BrowserCompatibilitySnapshot {
    const userAgent =
      input.userAgent ??
      (typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string'
        ? navigator.userAgent
        : 'unknown');
    const family = detectFamily(userAgent);

    const manifestVersion =
      input.manifestVersion ??
      this.detectManifestVersion();
    const cookiesApi = input.cookiesApi ?? Boolean(chrome?.cookies && chrome.cookies.onChanged);
    const storageApi = input.storageApi ?? Boolean(chrome?.storage?.local);
    const alarmsApi = input.alarmsApi ?? Boolean(chrome?.alarms?.create);

    const supportUnits = [
      manifestVersion === 3 ? 1 : 0,
      cookiesApi ? 1 : 0,
      storageApi ? 1 : 0,
      alarmsApi ? 1 : 0
    ];
    const supportScore = Math.round((supportUnits.reduce((sum, value) => sum + value, 0) / supportUnits.length) * 100);

    const warnings: string[] = [];
    if (manifestVersion !== 3) {
      warnings.push('Manifest V3 runtime not detected.');
    }
    if (!cookiesApi) {
      warnings.push('cookies API unavailable.');
    }
    if (!storageApi) {
      warnings.push('storage.local API unavailable.');
    }
    if (!alarmsApi) {
      warnings.push('alarms API unavailable.');
    }
    if (family === 'UNKNOWN') {
      warnings.push('Unknown browser family: compatibility requires manual verification.');
    }

    return {
      browserFamily: family,
      userAgent,
      manifestVersion: manifestVersion ?? null,
      cookiesApi,
      storageApi,
      alarmsApi,
      supportScore,
      readiness: resolveReadiness(supportScore, warnings),
      warnings,
      detectedAt: Date.now()
    };
  }

  private detectManifestVersion(): number | null {
    try {
      if (chrome?.runtime?.getManifest) {
        const manifest = chrome.runtime.getManifest();
        if (manifest && typeof manifest.manifest_version === 'number') {
          return manifest.manifest_version;
        }
      }
    } catch (error) {
      console.warn('Unable to read extension manifest at runtime.', error);
    }

    return null;
  }
}
