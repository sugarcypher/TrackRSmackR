export type DeceptionProbeType =
  | 'PATH_TRAVERSAL'
  | 'SQLI'
  | 'XSS'
  | 'COMMAND_INJECTION'
  | 'SCANNER';

export interface DeceptionProbeResult {
  triggered: boolean;
  probeType: DeceptionProbeType | 'NONE';
  matchedSignals: string[];
  route: string | null;
  confidence: number;
}

interface ProbePattern {
  type: DeceptionProbeType;
  label: string;
  regex: RegExp;
  targets: ('name' | 'value' | 'path' | 'domain')[];
}

const ABYSS_ROUTES = [
  'vm-lab://eternal-abyss/hypervisor/ghost-root-0',
  'vm-lab://eternal-abyss/decoy/.git/objects/omega',
  'vm-lab://eternal-abyss/decoy/etc/passwd-mirror',
  'vm-lab://eternal-abyss/decoy/wp-admin/frozen-shell',
  'vm-lab://eternal-abyss/maze/phpmyadmin/null-console',
  'vm-lab://eternal-abyss/maze/control-plane/loopback-void',
  'vm-lab://eternal-abyss/maze/telemetry/sinkhole-7',
  'vm-lab://eternal-abyss/maze/bastion/chroot-never'
];

const PROBE_PATTERNS: ProbePattern[] = [
  {
    type: 'PATH_TRAVERSAL',
    label: 'Path traversal token',
    regex: /(?:\.\.\/|%2e%2e%2f|\/etc\/passwd|\/proc\/self\/environ)/i,
    targets: ['path', 'value', 'name']
  },
  {
    type: 'SQLI',
    label: 'SQL injection token',
    regex: /(?:\bunion\s+select\b|\bor\s+1=1\b|information_schema|sleep\s*\(\d+\))/i,
    targets: ['name', 'value']
  },
  {
    type: 'XSS',
    label: 'Script injection token',
    regex: /(?:<script\b|javascript:|onerror\s*=|onload\s*=)/i,
    targets: ['name', 'value']
  },
  {
    type: 'COMMAND_INJECTION',
    label: 'Command injection token',
    regex: /(?:\b(?:cmd|exec|system|powershell)\b|;\s*(?:wget|curl|cat)\b|\$\((?:curl|wget))/i,
    targets: ['name', 'value']
  },
  {
    type: 'SCANNER',
    label: 'Scanner pathway probe',
    regex: /(?:wp-admin|phpmyadmin|xmlrpc\.php|\.git\/config|jmx-console|boaform)/i,
    targets: ['path', 'name', 'value', 'domain']
  }
];

function collectTargetText(cookie: chrome.cookies.Cookie, target: ProbePattern['targets'][number]): string {
  if (target === 'name') {
    return cookie.name;
  }

  if (target === 'value') {
    return cookie.value;
  }

  if (target === 'path') {
    return cookie.path;
  }

  return cookie.domain;
}

function normalizeSignals(signals: string[]): string[] {
  return Array.from(new Set(signals.map((signal) => signal.trim()).filter((signal) => signal.length > 0)));
}

export class DeceptionLabyrinthWorker {
  public inspect(cookie: chrome.cookies.Cookie): DeceptionProbeResult {
    const matchedSignals: string[] = [];
    const typeCounts = new Map<DeceptionProbeType, number>();

    for (const pattern of PROBE_PATTERNS) {
      for (const target of pattern.targets) {
        const text = collectTargetText(cookie, target);
        if (text.length === 0) {
          continue;
        }

        if (pattern.regex.test(text)) {
          matchedSignals.push(`${pattern.label} (${target})`);
          typeCounts.set(pattern.type, (typeCounts.get(pattern.type) ?? 0) + 1);
          break;
        }
      }
    }

    const dedupedSignals = normalizeSignals(matchedSignals);
    if (dedupedSignals.length === 0) {
      return {
        triggered: false,
        probeType: 'NONE',
        matchedSignals: [],
        route: null,
        confidence: 0.15
      };
    }

    const probeType = this.resolveDominantType(typeCounts);
    const route = this.routeFor(cookie, probeType, dedupedSignals);
    const confidence = Math.min(
      0.99,
      0.68 +
        dedupedSignals.length * 0.08 +
        (probeType === 'SCANNER' ? 0.05 : 0) +
        (probeType === 'COMMAND_INJECTION' ? 0.06 : 0)
    );

    return {
      triggered: true,
      probeType,
      matchedSignals: dedupedSignals,
      route,
      confidence
    };
  }

  private resolveDominantType(typeCounts: Map<DeceptionProbeType, number>): DeceptionProbeType {
    const ranking: DeceptionProbeType[] = [
      'COMMAND_INJECTION',
      'SQLI',
      'PATH_TRAVERSAL',
      'XSS',
      'SCANNER'
    ];

    let winner: DeceptionProbeType = 'SCANNER';
    let winnerCount = -1;

    for (const type of ranking) {
      const count = typeCounts.get(type) ?? 0;
      if (count > winnerCount) {
        winner = type;
        winnerCount = count;
      }
    }

    return winner;
  }

  private routeFor(cookie: chrome.cookies.Cookie, type: DeceptionProbeType, signals: string[]): string {
    const seed = `${cookie.domain}|${cookie.name}|${type}|${signals.join('|')}`;
    const hash = this.fnv1a(seed);
    return ABYSS_ROUTES[hash % ABYSS_ROUTES.length] ?? ABYSS_ROUTES[0];
  }

  private fnv1a(input: string): number {
    let hash = 0x811c9dc5;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }

    return hash >>> 0;
  }
}
