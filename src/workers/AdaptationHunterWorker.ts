export class AdaptationHunterWorker {
  public inspect(cookie: chrome.cookies.Cookie): string[] {
    const findings: string[] = [];
    const lowerName = cookie.name.toLowerCase();
    const lowerValue = cookie.value.toLowerCase();

    if (/[a-f0-9]{20,}/.test(cookie.value)) {
      findings.push('Long hex-like value');
    }

    if (lowerName.includes('fp') || lowerName.includes('fingerprint')) {
      findings.push('Possible fingerprint identifier');
    }

    if (cookie.domain.split('.').length > 4) {
      findings.push('Deep subdomain usage');
    }

    const fingerprintKeywords = [
      'canvas',
      'webgl',
      'audiocontext',
      'webrtc',
      'device_memory',
      'devicememory',
      'hardware_concurrency',
      'hardwareconcurrency',
      'timezone',
      'font',
      'plugins',
      'battery',
      'speechvoices'
    ];

    if (fingerprintKeywords.some((keyword) => lowerName.includes(keyword) || lowerValue.includes(keyword))) {
      findings.push('Fingerprint surface enumeration');
    }

    if (/(?:[A-Za-z0-9+/]{24,}={0,2})/.test(cookie.value)) {
      findings.push('High-entropy token payload');
    }

    if (/(?:visitor|device|client|browser)[-_]?id/.test(lowerName)) {
      findings.push('Long-lived device identifier pattern');
    }

    return Array.from(new Set(findings));
  }
}
