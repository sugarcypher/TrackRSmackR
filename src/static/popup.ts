import { AuditLog, type AuditEntry } from '../core/AuditLog.js';
import type {
  BrowserCompatibilitySnapshot,
  BrowserReadiness,
  DriftAlert,
  IntelligenceSummary,
  PerformancePressure,
  PerformanceSnapshot,
  ThreatPosture,
  TutorSwarmSnapshot
} from '../core/IntelligenceTypes.js';

type PopupSettings = {
  policyMode?: string;
  userAllowlist?: string[];
  tutorSwarmAutopilotEnabled?: boolean;
  contextPolicyEnabled?: boolean;
  contextBreakageAdaptiveEnabled?: boolean;
  contextBreakageRelaxThreshold?: number;
  contextPolicyRules?: ContextPolicyRule[];
  policyInvariantFloorMode?: string;
  policyInvariantDomainBlocklist?: string[];
  policyInvariantEnforcePersona?: boolean;
  uniformPersonaEnabled?: boolean;
  personaEntropyNormalizationEnabled?: boolean;
  personaScriptBlocklistEnabled?: boolean;
  antiRegenerationEnabled?: boolean;
  aggressiveSetCookieStripEnabled?: boolean;
};

interface ContextPolicyRule {
  pattern: string;
  mode: 'STRICT' | 'BALANCED';
}

interface DriftAlertUi {
  key: string;
  delta: number;
  recentCount: number;
}

interface FallbackSummary {
  posture: 'Stable' | 'Guarded' | 'Elevated';
  fingerprintSignals: number;
  driftAlerts: DriftAlertUi[];
  deceptionProbes: number;
  deceptionRoutes: string[];
  p95LatencyMs: number | null;
  pressure: 'Normal' | 'Elevated' | 'Critical' | '-';
  readiness: 'Ready' | 'Partial' | 'Risk' | '-';
  compatibilityWarnings: string[];
  swarmSignal: string;
  swarmAction: string;
  swarmDetail: string;
}

type StoredData = {
  intelligenceSummary?: IntelligenceSummary;
  performanceSnapshot?: PerformanceSnapshot;
  browserCompatibility?: BrowserCompatibilitySnapshot;
};

function normalizeAllowlist(raw: string): string[] {
  const values = raw
    .split(/[\n,]/)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
  return Array.from(new Set(values));
}

function parseContextRules(raw: string): ContextPolicyRule[] {
  const rules: ContextPolicyRule[] = [];
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    const [patternRaw, modeRaw] = line.split('=').map((value) => value.trim());
    if (!patternRaw || !modeRaw) {
      continue;
    }

    const mode = modeRaw.toUpperCase();
    if (mode !== 'STRICT' && mode !== 'BALANCED') {
      continue;
    }

    rules.push({
      pattern: patternRaw.toLowerCase(),
      mode
    });
  }

  return rules;
}

function formatContextRules(rules: ContextPolicyRule[]): string {
  return rules.map((rule) => `${rule.pattern}=${rule.mode}`).join('\n');
}

function normalizeBreakageThreshold(raw: unknown): number {
  if (typeof raw !== 'number' || Number.isNaN(raw)) {
    return 4;
  }

  const rounded = Math.round(raw);
  return Math.min(Math.max(rounded, 2), 20);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function makeDriftKey(entry: AuditEntry): string {
  if (entry.driftKey && entry.driftKey.length > 0) {
    return entry.driftKey;
  }

  const signalKey =
    entry.adaptationSignals && entry.adaptationSignals.length > 0
      ? [...entry.adaptationSignals].sort().join('+').toLowerCase()
      : 'none';

  return `${entry.domain}|${entry.action}|${signalKey}`;
}

function countByDriftKey(entries: AuditEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const key = makeDriftKey(entry);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function formatDriftAlert(alert: DriftAlertUi): string {
  const [domain, action, signalKey] = alert.key.split('|');
  const signalLabel = signalKey && signalKey !== 'none' ? `signals: ${signalKey}` : 'signals: none';

  return `${domain} · ${action} · ${signalLabel} (+${alert.delta}, ${alert.recentCount} recent)`;
}

function mapPosture(posture: ThreatPosture): 'Stable' | 'Guarded' | 'Elevated' {
  if (posture === 'ELEVATED') {
    return 'Elevated';
  }

  if (posture === 'GUARDED') {
    return 'Guarded';
  }

  return 'Stable';
}

function mapPressure(pressure: PerformancePressure): 'Normal' | 'Elevated' | 'Critical' {
  if (pressure === 'CRITICAL') {
    return 'Critical';
  }

  if (pressure === 'ELEVATED') {
    return 'Elevated';
  }

  return 'Normal';
}

function mapReadiness(readiness: BrowserReadiness): 'Ready' | 'Partial' | 'Risk' {
  if (readiness === 'READY') {
    return 'Ready';
  }

  if (readiness === 'PARTIAL') {
    return 'Partial';
  }

  return 'Risk';
}

function normalizeStoredSummary(summary: IntelligenceSummary): FallbackSummary {
  const driftAlerts: DriftAlertUi[] = (summary.topDriftAlerts ?? []).map((alert: DriftAlert) => ({
    key: alert.key,
    delta: alert.delta,
    recentCount: alert.recentCount
  }));
  const swarm = summary.tutorSwarm;
  const swarmDetail = buildSwarmDetail(swarm);

  return {
    posture: mapPosture(summary.posture),
    fingerprintSignals: summary.fingerprintSignals,
    driftAlerts,
    deceptionProbes: summary.deceptionProbes ?? 0,
    deceptionRoutes: summary.deceptionRouteHotspots ?? [],
    p95LatencyMs:
      summary.performance && typeof summary.performance.p95TotalMs === 'number'
        ? summary.performance.p95TotalMs
        : null,
    pressure:
      summary.performance && summary.performance.pressure
        ? mapPressure(summary.performance.pressure)
        : '-',
    readiness:
      summary.browserCompatibility && summary.browserCompatibility.readiness
        ? mapReadiness(summary.browserCompatibility.readiness)
        : '-',
    compatibilityWarnings: summary.browserCompatibility?.warnings ?? [],
    swarmSignal: swarm?.signal ?? '-',
    swarmAction: swarm?.interventionAction ?? '-',
    swarmDetail
  };
}

function buildFallbackSummary(history: AuditEntry[]): FallbackSummary {
  const recentWindow = history.slice(-80);
  const baselineWindow = history.slice(Math.max(0, history.length - 160), Math.max(0, history.length - 80));

  const recentCounts = countByDriftKey(recentWindow);
  const baselineCounts = countByDriftKey(baselineWindow);

  const driftAlerts: DriftAlertUi[] = [];
  for (const [key, recentCount] of recentCounts.entries()) {
    const baselineCount = baselineCounts.get(key) ?? 0;
    const delta = recentCount - baselineCount;

    if (recentCount >= 2 && delta >= 2) {
      driftAlerts.push({ key, delta, recentCount });
    }
  }

  driftAlerts.sort((a, b) => b.delta - a.delta || b.recentCount - a.recentCount);

  const fingerprintSignals = recentWindow.filter((entry) =>
    (entry.adaptationSignals ?? []).some((signal) => /fingerprint|hex-like|\bfp\b/i.test(signal))
  ).length;

  const severeActions = recentWindow.filter(
    (entry) => entry.action === 'QUARANTINE' || entry.action === 'BLOCK'
  ).length;
  const deceptionEntries = recentWindow.filter((entry) => entry.deceptionTriggered === true);
  const routeCounts = new Map<string, number>();
  for (const entry of deceptionEntries) {
    if (!entry.deceptionRoute) {
      continue;
    }
    routeCounts.set(entry.deceptionRoute, (routeCounts.get(entry.deceptionRoute) ?? 0) + 1);
  }
  const deceptionRoutes = [...routeCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([route]) => route);

  const postureScore =
    severeActions + driftAlerts.length * 2 + fingerprintSignals * 2 + deceptionEntries.length * 3;
  const posture: FallbackSummary['posture'] =
    postureScore >= 12 ? 'Elevated' : postureScore >= 5 ? 'Guarded' : 'Stable';

  return {
    posture,
    fingerprintSignals,
    driftAlerts: driftAlerts.slice(0, 5),
    deceptionProbes: deceptionEntries.length,
    deceptionRoutes,
    p95LatencyMs: null,
    pressure: '-',
    readiness: '-',
    compatibilityWarnings: [],
    swarmSignal: '-',
    swarmAction: '-',
    swarmDetail: 'No swarm cycles yet.'
  };
}

function buildSwarmDetail(swarm?: TutorSwarmSnapshot): string {
  if (!swarm) {
    return 'No swarm cycles yet.';
  }

  return `${swarm.complianceMessage} · ${swarm.diagnosis} · val slope ${swarm.slopeVal.toFixed(3)}`;
}

async function loadSettings(
  policySelect: HTMLSelectElement,
  tutorSwarmAutopilotToggle: HTMLInputElement,
  contextPolicyToggle: HTMLInputElement,
  contextBreakageToggle: HTMLInputElement,
  contextBreakageThresholdInput: HTMLInputElement,
  contextRulesInput: HTMLTextAreaElement,
  policyFloorModeSelect: HTMLSelectElement,
  policyFloorBlocklistInput: HTMLTextAreaElement,
  allowlistInput: HTMLTextAreaElement,
  uniformPersonaToggle: HTMLInputElement,
  entropyNormalizationToggle: HTMLInputElement,
  scriptBlocklistToggle: HTMLInputElement,
  antiRegenerationToggle: HTMLInputElement,
  aggressiveStripToggle: HTMLInputElement
): Promise<void> {
  const data = (await chrome.storage.local.get([
    'policyMode',
    'userAllowlist',
    'tutorSwarmAutopilotEnabled',
    'contextPolicyEnabled',
    'contextBreakageAdaptiveEnabled',
    'contextBreakageRelaxThreshold',
    'contextPolicyRules',
    'policyInvariantFloorMode',
    'policyInvariantDomainBlocklist',
    'policyInvariantEnforcePersona',
    'uniformPersonaEnabled',
    'personaEntropyNormalizationEnabled',
    'personaScriptBlocklistEnabled',
    'antiRegenerationEnabled',
    'aggressiveSetCookieStripEnabled'
  ])) as PopupSettings;

  if (data.policyMode === 'STRICT' || data.policyMode === 'BALANCED') {
    policySelect.value = data.policyMode;
  } else {
    policySelect.value = 'BALANCED';
  }

  const allowlist = Array.isArray(data.userAllowlist) ? data.userAllowlist : [];
  tutorSwarmAutopilotToggle.checked = data.tutorSwarmAutopilotEnabled !== false;
  contextPolicyToggle.checked = data.contextPolicyEnabled !== false;
  contextBreakageToggle.checked = data.contextBreakageAdaptiveEnabled !== false;
  contextBreakageThresholdInput.value = String(normalizeBreakageThreshold(data.contextBreakageRelaxThreshold));
  contextRulesInput.value = Array.isArray(data.contextPolicyRules)
    ? formatContextRules(data.contextPolicyRules)
    : '';
  policyFloorModeSelect.value =
    data.policyInvariantFloorMode === 'STRICT' || data.policyInvariantFloorMode === 'BALANCED'
      ? data.policyInvariantFloorMode
      : 'BALANCED';
  policyFloorBlocklistInput.value = Array.isArray(data.policyInvariantDomainBlocklist)
    ? Array.from(
        new Set(
          data.policyInvariantDomainBlocklist
            .filter((domain) => typeof domain === 'string')
            .map((domain) => domain.trim().toLowerCase())
            .filter((domain) => domain.length > 0)
        )
      ).join('\n')
    : '';
  allowlistInput.value = allowlist.join('\n');
  uniformPersonaToggle.checked = data.uniformPersonaEnabled !== false;
  entropyNormalizationToggle.checked = data.personaEntropyNormalizationEnabled !== false;
  scriptBlocklistToggle.checked = data.personaScriptBlocklistEnabled !== false;
  antiRegenerationToggle.checked = data.antiRegenerationEnabled !== false;
  aggressiveStripToggle.checked = data.aggressiveSetCookieStripEnabled !== false;
}

async function saveSettings(
  policySelect: HTMLSelectElement,
  tutorSwarmAutopilotToggle: HTMLInputElement,
  contextPolicyToggle: HTMLInputElement,
  contextBreakageToggle: HTMLInputElement,
  contextBreakageThresholdInput: HTMLInputElement,
  contextRulesInput: HTMLTextAreaElement,
  policyFloorModeSelect: HTMLSelectElement,
  policyFloorBlocklistInput: HTMLTextAreaElement,
  allowlistInput: HTMLTextAreaElement,
  uniformPersonaToggle: HTMLInputElement,
  entropyNormalizationToggle: HTMLInputElement,
  scriptBlocklistToggle: HTMLInputElement,
  antiRegenerationToggle: HTMLInputElement,
  aggressiveStripToggle: HTMLInputElement,
  statusDiv: HTMLElement
): Promise<void> {
  const policyMode = policySelect.value === 'STRICT' ? 'STRICT' : 'BALANCED';
  const userAllowlist = normalizeAllowlist(allowlistInput.value);
  const tutorSwarmAutopilotEnabled = tutorSwarmAutopilotToggle.checked;
  const contextPolicyEnabled = contextPolicyToggle.checked;
  const contextBreakageAdaptiveEnabled = contextBreakageToggle.checked;
  const contextBreakageRelaxThreshold = normalizeBreakageThreshold(
    Number(contextBreakageThresholdInput.value)
  );
  const contextPolicyRules = parseContextRules(contextRulesInput.value);
  const policyInvariantFloorMode =
    policyFloorModeSelect.value === 'STRICT' ? 'STRICT' : 'BALANCED';
  const policyInvariantDomainBlocklist = normalizeAllowlist(policyFloorBlocklistInput.value);
  const uniformPersonaEnabled = uniformPersonaToggle.checked;
  const personaEntropyNormalizationEnabled = entropyNormalizationToggle.checked;
  const personaScriptBlocklistEnabled = scriptBlocklistToggle.checked;
  const antiRegenerationEnabled = antiRegenerationToggle.checked;
  const aggressiveSetCookieStripEnabled = aggressiveStripToggle.checked;

  await chrome.storage.local.set({
    policyMode,
    userAllowlist,
    tutorSwarmAutopilotEnabled,
    contextPolicyEnabled,
    contextBreakageAdaptiveEnabled,
    contextBreakageRelaxThreshold,
    contextPolicyRules,
    policyInvariantFloorMode,
    policyInvariantDomainBlocklist,
    policyInvariantEnforcePersona: true,
    uniformPersonaEnabled,
    personaEntropyNormalizationEnabled,
    personaScriptBlocklistEnabled,
    antiRegenerationEnabled,
    aggressiveSetCookieStripEnabled
  });
  statusDiv.innerText =
    `Saved ${new Date().toLocaleTimeString()} (autopilot + regeneration apply immediately; reload tabs for persona toggles)`;
}

async function loadIntelligenceSummary(history: AuditEntry[]): Promise<FallbackSummary> {
  const stored = (await chrome.storage.local.get([
    'intelligenceSummary',
    'performanceSnapshot',
    'browserCompatibility'
  ])) as StoredData;
  const summary = stored.intelligenceSummary;
  const storedPerformance = stored.performanceSnapshot;
  const storedCompatibility = stored.browserCompatibility;
  let result: FallbackSummary;

  if (summary && summary.source === 'engine' && typeof summary.updatedAt === 'number') {
    result = normalizeStoredSummary(summary);
  } else {
    result = buildFallbackSummary(history);
  }

  if (result.p95LatencyMs === null && storedPerformance && typeof storedPerformance.p95TotalMs === 'number') {
    result.p95LatencyMs = storedPerformance.p95TotalMs;
  }

  if (result.pressure === '-' && storedPerformance?.pressure) {
    result.pressure = mapPressure(storedPerformance.pressure);
  }

  if (result.readiness === '-' && storedCompatibility?.readiness) {
    result.readiness = mapReadiness(storedCompatibility.readiness);
  }

  if (result.compatibilityWarnings.length === 0 && Array.isArray(storedCompatibility?.warnings)) {
    result.compatibilityWarnings = storedCompatibility.warnings;
  }

  return result;
}

function renderSummary(summary: FallbackSummary): void {
  const postureEl = document.getElementById('summary-posture');
  const fingerprintEl = document.getElementById('summary-fingerprint');
  const driftCountEl = document.getElementById('summary-drift-count');
  const deceptionEl = document.getElementById('summary-deception');
  const latencyEl = document.getElementById('summary-latency');
  const readinessEl = document.getElementById('summary-readiness');
  const swarmSignalEl = document.getElementById('summary-swarm-signal');
  const swarmActionEl = document.getElementById('summary-swarm-action');
  const swarmDetailEl = document.getElementById('summary-swarm-detail');
  const driftListEl = document.getElementById('summary-drift-list');
  const deceptionListEl = document.getElementById('summary-deception-list');
  const compatibilityListEl = document.getElementById('summary-compat-list');

  if (
    !(postureEl instanceof HTMLElement) ||
    !(fingerprintEl instanceof HTMLElement) ||
    !(driftCountEl instanceof HTMLElement) ||
    !(deceptionEl instanceof HTMLElement) ||
    !(latencyEl instanceof HTMLElement) ||
    !(readinessEl instanceof HTMLElement) ||
    !(swarmSignalEl instanceof HTMLElement) ||
    !(swarmActionEl instanceof HTMLElement) ||
    !(swarmDetailEl instanceof HTMLElement) ||
    !(driftListEl instanceof HTMLElement) ||
    !(deceptionListEl instanceof HTMLElement) ||
    !(compatibilityListEl instanceof HTMLElement)
  ) {
    return;
  }

  postureEl.innerText = summary.posture;
  fingerprintEl.innerText = String(summary.fingerprintSignals);
  driftCountEl.innerText = String(summary.driftAlerts.length);
  deceptionEl.innerText = String(summary.deceptionProbes);
  latencyEl.innerText = summary.p95LatencyMs === null ? '-' : String(summary.p95LatencyMs);
  readinessEl.innerText = summary.readiness === '-' ? '-' : `${summary.readiness} · ${summary.pressure}`;
  swarmSignalEl.innerText = summary.swarmSignal;
  swarmActionEl.innerText = summary.swarmAction;
  swarmDetailEl.innerText = summary.swarmDetail;

  if (summary.driftAlerts.length === 0) {
    driftListEl.innerHTML = '<li>No significant drift detected yet.</li>';
  } else {
    driftListEl.innerHTML = summary.driftAlerts
      .map((alert) => `<li>${escapeHtml(formatDriftAlert(alert))}</li>`)
      .join('');
  }

  if (summary.deceptionRoutes.length === 0) {
    deceptionListEl.innerHTML = '<li>No deception probes trapped yet.</li>';
  } else {
    deceptionListEl.innerHTML = summary.deceptionRoutes
      .map((route) => `<li>${escapeHtml(route)}</li>`)
      .join('');
  }

  if (summary.compatibilityWarnings.length === 0) {
    compatibilityListEl.innerHTML = '<li>No compatibility warnings.</li>';
  } else {
    compatibilityListEl.innerHTML = summary.compatibilityWarnings
      .map((warning) => `<li>${escapeHtml(warning)}</li>`)
      .join('');
  }
}

function renderHistory(logDiv: HTMLElement, history: AuditEntry[]): void {
  if (history.length === 0) {
    logDiv.innerText = 'No tracking events detected yet.';
    return;
  }

  const recentEntries = history.slice(-12).reverse();
  logDiv.innerHTML = recentEntries
    .map((entry) => {
      const reason = entry.policyReason ?? entry.reason;
      const explanation = entry.explanation && entry.explanation !== entry.reason ? entry.explanation : '';
      const signals = entry.adaptationSignals ?? [];
      const signalText =
        signals.length > 0 ? `<div class="log-signals">Signals: ${escapeHtml(signals.join(', '))}</div>` : '';
      const deceptionText =
        entry.deceptionTriggered && entry.deceptionRoute
          ? `<div class="log-meta">Deception Route: ${escapeHtml(entry.deceptionRoute)}</div>`
          : '';

      return `<div class="log-entry">
          <div class="log-title">${escapeHtml(entry.action)} · ${escapeHtml(entry.name)}</div>
          <div class="log-meta">${escapeHtml(entry.domain)} · ${new Date(entry.timestamp).toLocaleTimeString()}</div>
          <div class="log-reason">${escapeHtml(reason)}</div>
          ${explanation ? `<div class="log-reason">${escapeHtml(explanation)}</div>` : ''}
          ${signalText}
          ${deceptionText}
          ${entry.outcome ? `<div class="log-meta">Outcome: ${escapeHtml(entry.outcome)}</div>` : ''}
        </div>`;
    })
    .join('');
}

document.addEventListener('DOMContentLoaded', async () => {
  const logDiv = document.getElementById('logs');
  const policySelect = document.getElementById('policy-mode');
  const tutorSwarmAutopilotToggle = document.getElementById('tutor-swarm-autopilot-toggle');
  const contextPolicyToggle = document.getElementById('context-policy-toggle');
  const contextBreakageToggle = document.getElementById('context-breakage-toggle');
  const contextBreakageThresholdInput = document.getElementById('context-breakage-threshold');
  const contextRulesInput = document.getElementById('context-rules-input');
  const policyFloorModeSelect = document.getElementById('policy-floor-mode');
  const policyFloorBlocklistInput = document.getElementById('policy-floor-blocklist');
  const allowlistInput = document.getElementById('allowlist-input');
  const uniformPersonaToggle = document.getElementById('uniform-persona-toggle');
  const entropyNormalizationToggle = document.getElementById('entropy-normalization-toggle');
  const scriptBlocklistToggle = document.getElementById('script-blocklist-toggle');
  const antiRegenerationToggle = document.getElementById('anti-regeneration-toggle');
  const aggressiveStripToggle = document.getElementById('aggressive-strip-toggle');
  const saveButton = document.getElementById('save-settings');
  const settingsStatus = document.getElementById('settings-status');
  const audit = new AuditLog();
  const history = await audit.getHistory();

  if (
    !(logDiv instanceof HTMLElement) ||
    !(policySelect instanceof HTMLSelectElement) ||
    !(tutorSwarmAutopilotToggle instanceof HTMLInputElement) ||
    !(contextPolicyToggle instanceof HTMLInputElement) ||
    !(contextBreakageToggle instanceof HTMLInputElement) ||
    !(contextBreakageThresholdInput instanceof HTMLInputElement) ||
    !(contextRulesInput instanceof HTMLTextAreaElement) ||
    !(policyFloorModeSelect instanceof HTMLSelectElement) ||
    !(policyFloorBlocklistInput instanceof HTMLTextAreaElement) ||
    !(allowlistInput instanceof HTMLTextAreaElement) ||
    !(uniformPersonaToggle instanceof HTMLInputElement) ||
    !(entropyNormalizationToggle instanceof HTMLInputElement) ||
    !(scriptBlocklistToggle instanceof HTMLInputElement) ||
    !(antiRegenerationToggle instanceof HTMLInputElement) ||
    !(aggressiveStripToggle instanceof HTMLInputElement) ||
    !(saveButton instanceof HTMLButtonElement) ||
    !(settingsStatus instanceof HTMLElement)
  ) {
    return;
  }

  await loadSettings(
    policySelect,
    tutorSwarmAutopilotToggle,
    contextPolicyToggle,
    contextBreakageToggle,
    contextBreakageThresholdInput,
    contextRulesInput,
    policyFloorModeSelect,
    policyFloorBlocklistInput,
    allowlistInput,
    uniformPersonaToggle,
    entropyNormalizationToggle,
    scriptBlocklistToggle,
    antiRegenerationToggle,
    aggressiveStripToggle
  );
  saveButton.addEventListener('click', async () => {
    try {
      await saveSettings(
        policySelect,
        tutorSwarmAutopilotToggle,
        contextPolicyToggle,
        contextBreakageToggle,
        contextBreakageThresholdInput,
        contextRulesInput,
        policyFloorModeSelect,
        policyFloorBlocklistInput,
        allowlistInput,
        uniformPersonaToggle,
        entropyNormalizationToggle,
        scriptBlocklistToggle,
        antiRegenerationToggle,
        aggressiveStripToggle,
        settingsStatus
      );
    } catch (error) {
      console.error('Failed to save settings', error);
      settingsStatus.innerText = 'Failed to save settings.';
    }
  });

  const summary = await loadIntelligenceSummary(history);
  renderSummary(summary);
  renderHistory(logDiv, history);
});
