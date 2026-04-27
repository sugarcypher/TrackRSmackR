export class AdaptationHunterWorker {
  private uniformPersona = false;
  private regenShield = false;

  public async init(): Promise<void> {
    const data = (await chrome.storage.local.get([
      'uniformPersona',
      'regenShield'
    ])) as { uniformPersona?: unknown; regenShield?: unknown };

    this.uniformPersona = data.uniformPersona === true;
    this.regenShield = data.regenShield === true;
  }

  public isUniformPersonaEnabled(): boolean {
    return this.uniformPersona;
  }

  public isRegenShieldEnabled(): boolean {
    return this.regenShield;
  }

  public inspect(cookie: chrome.cookies.Cookie): string[] {
    const findings: string[] = [];
    const lowerName = cookie.name.toLowerCase();

    if (/[a-f0-9]{20,}/.test(cookie.value)) {
      findings.push('Long hex-like value');
    }

    if (lowerName.includes('fp') || lowerName.includes('fingerprint')) {
      findings.push('Possible fingerprint identifier');
    }

    if (cookie.domain.split('.').length > 4) {
      findings.push('Deep subdomain usage');
    }

    if (this.uniformPersona && (lowerName.includes('persona') || lowerName.includes('ua'))) {
      findings.push('Uniform persona enforcement');
    }

    if (this.regenShield && lowerName.includes('regen')) {
      findings.push('Regeneration shield trigger');
    }

    return findings;
  }
}
