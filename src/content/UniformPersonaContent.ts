type PersonaSettings = {
  uniformPersonaEnabled?: boolean;
  personaEntropyNormalizationEnabled?: boolean;
  personaScriptBlocklistEnabled?: boolean;
  contextBreakageAdaptiveEnabled?: boolean;
};

type ContextSensitivity = 'LOW' | 'MEDIUM' | 'HIGH';

interface ContextSensitivityRecord {
  sensitivity: ContextSensitivity;
  source: 'form-detection';
  matchedFields: string[];
  updatedAt: number;
}

type BreakageSignalType = 'scriptError' | 'promiseRejection' | 'resourceFailure' | 'rageClick';

interface ContextBreakageRecord {
  score: number;
  scriptErrors: number;
  rejectedPromises: number;
  resourceFailures: number;
  rageClicks: number;
  lastSignalAt: number;
  updatedAt: number;
}

interface BreakageSignalAccumulator {
  score: number;
  scriptErrors: number;
  rejectedPromises: number;
  resourceFailures: number;
  rageClicks: number;
}

type ContextSensitivityMap = Record<string, ContextSensitivityRecord>;
type ContextBreakageMap = Record<string, ContextBreakageRecord>;

const PERSONA_MARKER = '__trackr_uniform_persona_applied__';
const PERSONA_SCRIPT_ID = '__labcoat_uniform_persona_main_script__';
const PERSONA_ENTROPY_ATTR = 'data-labcoat-entropy';
const PERSONA_SCRIPT_BLOCKLIST_ATTR = 'data-labcoat-script-blocklist';
const PERSONA_ASSIGNMENT_ATTR = 'data-labcoat-persona-data';
const PERSONA_ASSIGNED_KEY = 'trackrsmackrAssignedPersona';
let cachedPersonaJson: string | null = null;
const BREAKAGE_FLUSH_MS = 1200;
const BREAKAGE_SCORE_CAP = 80;
const BREAKAGE_RATE_WINDOW_MS = 30_000;
const BREAKAGE_RATE_LIMIT_PER_SIGNAL = 6;
const RAGE_CLICK_WINDOW_MS = 1200;
const RAGE_CLICK_THRESHOLD = 4;
const BREAKAGE_SIGNAL_WEIGHTS: Record<BreakageSignalType, number> = {
  scriptError: 2,
  promiseRejection: 2,
  resourceFailure: 1,
  rageClick: 3
};

const HIGH_SENSITIVITY_FIELD_PATTERNS = [
  /password/i,
  /passcode/i,
  /routing/i,
  /account(?:number|_number)?/i,
  /credit(?:card)?/i,
  /debit(?:card)?/i,
  /card(?:number|_number)?/i,
  /cvv|cvc/i,
  /iban/i,
  /ssn|social/i,
  /tax(?:id|payer)/i
];
const MEDIUM_SENSITIVITY_FIELD_PATTERNS = [
  /email/i,
  /phone|mobile/i,
  /address/i,
  /zip|postal/i,
  /dob|birth/i
];

const breakageRateMap: Record<BreakageSignalType, number[]> = {
  scriptError: [],
  promiseRejection: [],
  resourceFailure: [],
  rageClick: []
};

let breakageSignalsEnabled = true;
let breakageObserverStarted = false;
let breakageFlushTimer: number | null = null;
let breakageFlushInFlight = false;
let lastBreakageSignalAt = 0;
let pendingBreakage: BreakageSignalAccumulator = {
  score: 0,
  scriptErrors: 0,
  rejectedPromises: 0,
  resourceFailures: 0,
  rageClicks: 0
};
let rageTargetKey = '';
let rageWindowStart = 0;
let rageBurstCount = 0;

function storageGetLocal<T extends Record<string, unknown>>(
  keys: string | string[] | Record<string, unknown> | null
): Promise<T> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(keys, (items) => {
        resolve((items ?? {}) as T);
      });
    } catch (_error) {
      resolve({} as T);
    }
  });
}

function storageSetLocal(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set(items, () => resolve());
    } catch (_error) {
      resolve();
    }
  });
}

async function resolveAssignedPersonaJson(): Promise<string | null> {
  if (cachedPersonaJson !== null) {
    return cachedPersonaJson;
  }
  const stored = await storageGetLocal<{ [PERSONA_ASSIGNED_KEY]?: unknown }>(
    PERSONA_ASSIGNED_KEY
  );
  const persona = stored[PERSONA_ASSIGNED_KEY];
  if (persona && typeof persona === 'object') {
    try {
      cachedPersonaJson = JSON.stringify(persona);
      return cachedPersonaJson;
    } catch (_error) {
      return null;
    }
  }
  return null;
}

function setPersonaConfigAttributes(
  entropyNormalizationEnabled: boolean,
  scriptBlocklistEnabled: boolean,
  personaJson: string | null
): boolean {
  const root = document.documentElement;
  if (!root) {
    return false;
  }

  root.setAttribute(PERSONA_ENTROPY_ATTR, entropyNormalizationEnabled ? '1' : '0');
  root.setAttribute(PERSONA_SCRIPT_BLOCKLIST_ATTR, scriptBlocklistEnabled ? '1' : '0');
  if (personaJson !== null) {
    root.setAttribute(PERSONA_ASSIGNMENT_ATTR, personaJson);
  }
  return true;
}

function injectMainWorldPatch(
  personaEntropyNormalizationEnabled: boolean,
  personaScriptBlocklistEnabled: boolean
): void {
  if (document.documentElement?.hasAttribute(PERSONA_MARKER)) {
    return;
  }

  if (
    !setPersonaConfigAttributes(
      personaEntropyNormalizationEnabled,
      personaScriptBlocklistEnabled,
      cachedPersonaJson
    )
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        injectMainWorldPatch(personaEntropyNormalizationEnabled, personaScriptBlocklistEnabled);
      },
      { once: true }
    );
    return;
  }

  if (document.getElementById(PERSONA_SCRIPT_ID)) {
    return;
  }

  const target = document.head ?? document.documentElement ?? document.body;
  if (!target) {
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        injectMainWorldPatch(personaEntropyNormalizationEnabled, personaScriptBlocklistEnabled);
      },
      { once: true }
    );
    return;
  }

  const script = document.createElement('script');
  script.id = PERSONA_SCRIPT_ID;
  script.src = chrome.runtime.getURL('content/UniformPersonaMainWorld.js');
  script.async = false;
  script.addEventListener(
    'load',
    () => {
      script.remove();
    },
    { once: true }
  );
  script.addEventListener(
    'error',
    () => {
      script.remove();
    },
    { once: true }
  );
  target.appendChild(script);
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase();
}

function resetPendingBreakage(): void {
  pendingBreakage = {
    score: 0,
    scriptErrors: 0,
    rejectedPromises: 0,
    resourceFailures: 0,
    rageClicks: 0
  };
  lastBreakageSignalAt = 0;
}

function shouldRecordBreakageSignal(type: BreakageSignalType): boolean {
  const now = Date.now();
  const timestamps = breakageRateMap[type];
  while (timestamps.length > 0 && now - timestamps[0] > BREAKAGE_RATE_WINDOW_MS) {
    timestamps.shift();
  }

  if (timestamps.length >= BREAKAGE_RATE_LIMIT_PER_SIGNAL) {
    return false;
  }

  timestamps.push(now);
  return true;
}

function scheduleBreakageFlush(delayMs: number = BREAKAGE_FLUSH_MS): void {
  if (breakageFlushTimer !== null) {
    window.clearTimeout(breakageFlushTimer);
  }

  breakageFlushTimer = window.setTimeout(() => {
    breakageFlushTimer = null;
    void flushBreakageSignals();
  }, delayMs);
}

async function flushBreakageSignals(): Promise<void> {
  if (breakageFlushInFlight || pendingBreakage.score <= 0) {
    return;
  }

  const host = normalizeHost(window.location.hostname);
  if (!host) {
    return;
  }

  breakageFlushInFlight = true;
  const snapshot = pendingBreakage;
  const signalAt = lastBreakageSignalAt || Date.now();
  resetPendingBreakage();

  try {
    const current = await storageGetLocal<{ contextBreakageMap?: ContextBreakageMap }>('contextBreakageMap');
    const map: ContextBreakageMap = { ...(current.contextBreakageMap ?? {}) };
    const existing = map[host];

    map[host] = {
      score: Math.min(BREAKAGE_SCORE_CAP, (existing?.score ?? 0) + snapshot.score),
      scriptErrors: (existing?.scriptErrors ?? 0) + snapshot.scriptErrors,
      rejectedPromises: (existing?.rejectedPromises ?? 0) + snapshot.rejectedPromises,
      resourceFailures: (existing?.resourceFailures ?? 0) + snapshot.resourceFailures,
      rageClicks: (existing?.rageClicks ?? 0) + snapshot.rageClicks,
      lastSignalAt: Math.max(existing?.lastSignalAt ?? 0, signalAt),
      updatedAt: Date.now()
    };

    await storageSetLocal({ contextBreakageMap: map });
  } finally {
    breakageFlushInFlight = false;
    if (pendingBreakage.score > 0) {
      scheduleBreakageFlush(300);
    }
  }
}

function recordBreakageSignal(type: BreakageSignalType): void {
  if (!breakageSignalsEnabled || !shouldRecordBreakageSignal(type)) {
    return;
  }

  pendingBreakage.score += BREAKAGE_SIGNAL_WEIGHTS[type];
  if (type === 'scriptError') {
    pendingBreakage.scriptErrors += 1;
  } else if (type === 'promiseRejection') {
    pendingBreakage.rejectedPromises += 1;
  } else if (type === 'resourceFailure') {
    pendingBreakage.resourceFailures += 1;
  } else if (type === 'rageClick') {
    pendingBreakage.rageClicks += 1;
  }
  lastBreakageSignalAt = Date.now();
  scheduleBreakageFlush();
}

function isInteractiveTarget(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const interactive = target.closest(
    'button,a,input,select,textarea,[role="button"],[role="link"],[data-action],[onclick]'
  );
  return interactive instanceof HTMLElement;
}

function interactiveTargetKey(target: HTMLElement): string {
  const root = target.closest(
    'button,a,input,select,textarea,[role="button"],[role="link"],[data-action],[onclick]'
  );
  if (!(root instanceof HTMLElement)) {
    return target.tagName.toLowerCase();
  }

  const id = root.id ? `#${root.id.slice(0, 60)}` : '';
  const role = root.getAttribute('role') ? `[role=${root.getAttribute('role')}]` : '';
  const classes = root.className
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((token) => `.${token}`)
    .join('');
  return `${root.tagName.toLowerCase()}${id}${role}${classes}`;
}

function detectRageClick(target: EventTarget | null): void {
  if (!isInteractiveTarget(target)) {
    rageTargetKey = '';
    rageWindowStart = 0;
    rageBurstCount = 0;
    return;
  }

  const now = Date.now();
  const key = interactiveTargetKey(target);
  if (key !== rageTargetKey || now - rageWindowStart > RAGE_CLICK_WINDOW_MS) {
    rageTargetKey = key;
    rageWindowStart = now;
    rageBurstCount = 1;
    return;
  }

  rageBurstCount += 1;
  if (rageBurstCount >= RAGE_CLICK_THRESHOLD) {
    recordBreakageSignal('rageClick');
    rageBurstCount = 0;
    rageWindowStart = now;
  }
}

function startBreakageObserver(): void {
  if (breakageObserverStarted) {
    return;
  }
  breakageObserverStarted = true;

  const extensionAssetPrefix = chrome.runtime.getURL('');

  window.addEventListener(
    'error',
    (event) => {
      const target = event.target;
      if (
        target instanceof HTMLScriptElement ||
        target instanceof HTMLLinkElement ||
        target instanceof HTMLImageElement
      ) {
        recordBreakageSignal('resourceFailure');
        return;
      }

      if (event instanceof ErrorEvent) {
        const filename = event.filename || '';
        if (filename.startsWith(extensionAssetPrefix)) {
          return;
        }
        recordBreakageSignal('scriptError');
      }
    },
    true
  );

  window.addEventListener('unhandledrejection', () => {
    recordBreakageSignal('promiseRejection');
  });

  document.addEventListener(
    'click',
    (event) => {
      detectRageClick(event.target);
    },
    true
  );

  window.addEventListener('pagehide', () => {
    if (breakageFlushTimer !== null) {
      window.clearTimeout(breakageFlushTimer);
      breakageFlushTimer = null;
    }
    void flushBreakageSignals();
  });
}

function detectSensitivityFromDom(): {
  sensitivity: ContextSensitivity;
  matchedFields: string[];
} {
  const fields = Array.from(document.querySelectorAll('input, textarea, select'));
  if (fields.length === 0) {
    return { sensitivity: 'LOW', matchedFields: [] };
  }

  const highMatches = new Set<string>();
  const mediumMatches = new Set<string>();

  for (const field of fields) {
    const tokens: string[] = [];
    if (field instanceof HTMLInputElement) {
      tokens.push(field.type || '');
      tokens.push(field.autocomplete || '');
    }
    if (field instanceof HTMLElement) {
      tokens.push(field.getAttribute('name') || '');
      tokens.push(field.getAttribute('id') || '');
      tokens.push(field.getAttribute('placeholder') || '');
      tokens.push(field.getAttribute('aria-label') || '');
    }

    const joined = tokens.join(' ').toLowerCase();
    if (joined.length === 0) {
      continue;
    }

    HIGH_SENSITIVITY_FIELD_PATTERNS.forEach((pattern) => {
      if (pattern.test(joined)) {
        highMatches.add(pattern.source);
      }
    });
    MEDIUM_SENSITIVITY_FIELD_PATTERNS.forEach((pattern) => {
      if (pattern.test(joined)) {
        mediumMatches.add(pattern.source);
      }
    });
  }

  if (highMatches.size > 0) {
    return { sensitivity: 'HIGH', matchedFields: Array.from(highMatches).sort() };
  }

  if (mediumMatches.size > 0) {
    return { sensitivity: 'MEDIUM', matchedFields: Array.from(mediumMatches).sort() };
  }

  return { sensitivity: 'LOW', matchedFields: [] };
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

async function updateContextSensitivityMap(): Promise<void> {
  const host = normalizeHost(window.location.hostname);
  if (!host) {
    return;
  }

  const sample = detectSensitivityFromDom();
  const current = await storageGetLocal<{
    contextSensitivityMap?: ContextSensitivityMap;
  }>('contextSensitivityMap');
  const map: ContextSensitivityMap = { ...(current.contextSensitivityMap ?? {}) };
  const existing = map[host];

  if (
    existing &&
    sensitivityRank(existing.sensitivity) >= sensitivityRank(sample.sensitivity) &&
    sample.matchedFields.every((field) => existing.matchedFields.includes(field))
  ) {
    return;
  }

  map[host] = {
    sensitivity:
      existing && sensitivityRank(existing.sensitivity) > sensitivityRank(sample.sensitivity)
        ? existing.sensitivity
        : sample.sensitivity,
    source: 'form-detection',
    matchedFields: Array.from(new Set([...(existing?.matchedFields ?? []), ...sample.matchedFields])).sort(),
    updatedAt: Date.now()
  };

  await storageSetLocal({ contextSensitivityMap: map });
}

function startContextSensitivityObserver(): void {
  let timer: number | null = null;
  const schedule = () => {
    if (timer !== null) {
      window.clearTimeout(timer);
    }
    timer = window.setTimeout(() => {
      timer = null;
      void updateContextSensitivityMap();
    }, 400);
  };

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        schedule();
      },
      { once: true }
    );
  } else {
    schedule();
  }

  const observer = new MutationObserver(() => {
    schedule();
  });
  observer.observe(document.documentElement || document, { childList: true, subtree: true });
}

async function bootstrapPersona(): Promise<void> {
  const settings = await storageGetLocal<PersonaSettings>([
    'uniformPersonaEnabled',
    'personaEntropyNormalizationEnabled',
    'personaScriptBlocklistEnabled',
    'contextBreakageAdaptiveEnabled'
  ]);
  await resolveAssignedPersonaJson();
  const enabled = settings.uniformPersonaEnabled !== false;
  const entropyNormalizationEnabled = settings.personaEntropyNormalizationEnabled !== false;
  const scriptBlocklistEnabled = settings.personaScriptBlocklistEnabled !== false;
  breakageSignalsEnabled = settings.contextBreakageAdaptiveEnabled !== false;

  if (enabled) {
    injectMainWorldPatch(entropyNormalizationEnabled, scriptBlocklistEnabled);
  }

  startContextSensitivityObserver();
  if (breakageSignalsEnabled) {
    startBreakageObserver();
  }
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (
    areaName !== 'local' ||
    (!changes.uniformPersonaEnabled &&
      !changes.personaEntropyNormalizationEnabled &&
      !changes.personaScriptBlocklistEnabled &&
      !changes.contextBreakageAdaptiveEnabled)
  ) {
    return;
  }

  const uniformPersonaEnabled = changes.uniformPersonaEnabled
    ? changes.uniformPersonaEnabled.newValue !== false
    : true;
  const entropyNormalizationEnabled = changes.personaEntropyNormalizationEnabled
    ? changes.personaEntropyNormalizationEnabled.newValue !== false
    : true;
  const scriptBlocklistEnabled = changes.personaScriptBlocklistEnabled
    ? changes.personaScriptBlocklistEnabled.newValue !== false
    : true;
  if (changes.contextBreakageAdaptiveEnabled) {
    breakageSignalsEnabled = changes.contextBreakageAdaptiveEnabled.newValue !== false;
    if (!breakageSignalsEnabled) {
      if (breakageFlushTimer !== null) {
        window.clearTimeout(breakageFlushTimer);
        breakageFlushTimer = null;
      }
      resetPendingBreakage();
    } else {
      startBreakageObserver();
    }
  }

  if (uniformPersonaEnabled) {
    injectMainWorldPatch(entropyNormalizationEnabled, scriptBlocklistEnabled);
  }
});

void bootstrapPersona();
