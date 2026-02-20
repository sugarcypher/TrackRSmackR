export class AdaptationHunterWorker {
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

    return findings;
  }
}
