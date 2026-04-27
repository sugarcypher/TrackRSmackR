import { AuditLog, type AuditEntry, type AuditOutcome } from '../core/AuditLog.js';

type PopupSettings = {
  policyMode?: string;
  userAllowlist?: string[];
};

interface DriftAlert {
  key: string;
  delta: number;
  recentCount: number;
}

interface IntelligenceSummary {
  posture: 'Stable' | 'Guarded' | 'Elevated';
  fingerprintSignals: number;
  driftAlerts: DriftAlert[];
}

interface SessionApprovedResponse {
  ok?: boolean;
  sessionApprovedCount?: number;
  error?: string;
}

const sessionApprovedOverrides = new Map<number, AuditOutcome>();

function normalizeAllowlist(raw: string): string[] {
  const values = raw
    .split(/[\n,]/)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
  return Array.from(new Set(values));
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(text: string): string {
  return escapeHtml(text);
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

function formatDriftAlert(alert: DriftAlert): string {
  const [domain, action, signalKey] = alert.key.split('|');
  const signalLabel = signalKey && signalKey !== 'none' ? `signals: ${signalKey}` : 'signals: none';

  return `${domain} · ${action} · ${signalLabel} (+${alert.delta}, ${alert.recentCount} recent)`;
}

function buildIntelligenceSummary(history: AuditEntry[]): IntelligenceSummary {
  const recentWindow = history.slice(-80);
  const baselineWindow = history.slice(Math.max(0, history.length - 160), Math.max(0, history.length - 80));

  const recentCounts = countByDriftKey(recentWindow);
  const baselineCounts = countByDriftKey(baselineWindow);

  const driftAlerts: DriftAlert[] = [];
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

  const postureScore = severeActions + driftAlerts.length * 2 + fingerprintSignals * 2;
  const posture: IntelligenceSummary['posture'] =
    postureScore >= 12 ? 'Elevated' : postureScore >= 5 ? 'Guarded' : 'Stable';

  return {
    posture,
    fingerprintSignals,
    driftAlerts: driftAlerts.slice(0, 5)
  };
}

async function loadSettings(
  policySelect: HTMLSelectElement,
  allowlistInput: HTMLTextAreaElement
): Promise<void> {
  const data = (await chrome.storage.local.get(['policyMode', 'userAllowlist'])) as PopupSettings;

  if (data.policyMode === 'STRICT' || data.policyMode === 'BALANCED') {
    policySelect.value = data.policyMode;
  } else {
    policySelect.value = 'BALANCED';
  }

  const allowlist = Array.isArray(data.userAllowlist) ? data.userAllowlist : [];
  allowlistInput.value = allowlist.join('\n');
}

async function saveSettings(
  policySelect: HTMLSelectElement,
  allowlistInput: HTMLTextAreaElement,
  statusDiv: HTMLElement
): Promise<void> {
  const policyMode = policySelect.value === 'STRICT' ? 'STRICT' : 'BALANCED';
  const userAllowlist = normalizeAllowlist(allowlistInput.value);

  await chrome.storage.local.set({ policyMode, userAllowlist });
  statusDiv.innerText = `Saved ${new Date().toLocaleTimeString()}`;
}

function renderSummary(history: AuditEntry[]): void {
  const postureEl = document.getElementById('summary-posture');
  const fingerprintEl = document.getElementById('summary-fingerprint');
  const driftCountEl = document.getElementById('summary-drift-count');
  const driftListEl = document.getElementById('summary-drift-list');

  if (
    !(postureEl instanceof HTMLElement) ||
    !(fingerprintEl instanceof HTMLElement) ||
    !(driftCountEl instanceof HTMLElement) ||
    !(driftListEl instanceof HTMLElement)
  ) {
    return;
  }

  const summary = buildIntelligenceSummary(history);

  postureEl.innerText = summary.posture;
  fingerprintEl.innerText = String(summary.fingerprintSignals);
  driftCountEl.innerText = String(summary.driftAlerts.length);

  if (summary.driftAlerts.length === 0) {
    driftListEl.innerHTML = '<li>No significant drift detected yet.</li>';
    return;
  }

  driftListEl.innerHTML = summary.driftAlerts
    .map((alert) => `<li>${escapeHtml(formatDriftAlert(alert))}</li>`)
    .join('');
}

function renderSessionApprovedCount(count: number): void {
  const sessionApprovedEl = document.getElementById('summary-session-approved');
  if (sessionApprovedEl instanceof HTMLElement) {
    sessionApprovedEl.innerText = String(count);
  }
}

function buildEntryHtml(entry: AuditEntry, index: number): string {
  const reason = entry.policyReason ?? entry.reason;
  const explanation = entry.explanation && entry.explanation !== entry.reason ? entry.explanation : '';
  const signals = entry.adaptationSignals ?? [];
  const signalText =
    signals.length > 0 ? `<div class="log-signals">Signals: ${escapeHtml(signals.join(', '))}</div>` : '';

  const displayedOutcome: AuditOutcome | undefined =
    sessionApprovedOverrides.get(index) ?? entry.outcome;
  const outcomeHtml = displayedOutcome
    ? `<div class="log-meta" data-role="outcome">Outcome: ${escapeHtml(displayedOutcome)}</div>`
    : '';

  const isTrustable =
    (entry.action === 'QUARANTINE' || entry.action === 'DECAY') &&
    displayedOutcome !== 'SESSION_APPROVED';

  const trustControls = isTrustable
    ? `<div class="log-actions" data-role="actions">
        <button type="button" class="trust-button" data-domain="${escapeAttr(entry.domain)}" data-permanent="false">Trust this site</button>
        <button type="button" class="trust-always" data-domain="${escapeAttr(entry.domain)}" data-permanent="true" title="Add to permanent allowlist">Always trust</button>
      </div>`
    : displayedOutcome === 'SESSION_APPROVED'
      ? `<div class="log-actions"><span class="trust-status">✓ Session approved</span></div>`
      : '';

  return `<div class="log-entry" data-entry-index="${index}">
      <div class="log-title">${escapeHtml(entry.action)} · ${escapeHtml(entry.name)}</div>
      <div class="log-meta">${escapeHtml(entry.domain)} · ${new Date(entry.timestamp).toLocaleTimeString()}</div>
      <div class="log-reason">${escapeHtml(reason)}</div>
      ${explanation ? `<div class="log-reason">${escapeHtml(explanation)}</div>` : ''}
      ${signalText}
      ${outcomeHtml}
      ${trustControls}
    </div>`;
}

function renderHistory(logDiv: HTMLElement, history: AuditEntry[]): void {
  if (history.length === 0) {
    logDiv.innerText = 'No tracking events detected yet.';
    return;
  }

  const recentEntries = history.slice(-12).reverse();
  logDiv.innerHTML = recentEntries
    .map((entry, idx) => buildEntryHtml(entry, idx))
    .join('');
}

async function dispatchSessionApprove(
  domain: string,
  permanent: boolean
): Promise<SessionApprovedResponse> {
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
    return { ok: false, error: 'chrome.runtime unavailable' };
  }

  try {
    const response = (await chrome.runtime.sendMessage({
      type: 'SESSION_APPROVE_DOMAIN',
      payload: { domain, permanent }
    })) as SessionApprovedResponse;

    return response ?? { ok: false };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

async function fetchSessionApprovedCount(): Promise<number> {
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
    return 0;
  }

  try {
    const response = (await chrome.runtime.sendMessage({
      type: 'GET_SESSION_APPROVED_COUNT'
    })) as SessionApprovedResponse;

    return typeof response?.sessionApprovedCount === 'number' ? response.sessionApprovedCount : 0;
  } catch {
    return 0;
  }
}

function applySessionApprovedToEntry(
  entryDiv: HTMLElement,
  index: number
): void {
  sessionApprovedOverrides.set(index, 'SESSION_APPROVED');

  const outcomeEl = entryDiv.querySelector('[data-role="outcome"]');
  if (outcomeEl instanceof HTMLElement) {
    outcomeEl.textContent = 'Outcome: SESSION_APPROVED';
  } else {
    const newOutcome = document.createElement('div');
    newOutcome.className = 'log-meta';
    newOutcome.setAttribute('data-role', 'outcome');
    newOutcome.textContent = 'Outcome: SESSION_APPROVED';
    entryDiv.appendChild(newOutcome);
  }

  const actionsEl = entryDiv.querySelector('[data-role="actions"]');
  if (actionsEl instanceof HTMLElement) {
    actionsEl.innerHTML = '<span class="trust-status">✓ Session approved</span>';
    actionsEl.removeAttribute('data-role');
  }
}

function attachTrustHandlers(logDiv: HTMLElement): void {
  logDiv.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (!target.classList.contains('trust-button') && !target.classList.contains('trust-always')) {
      return;
    }

    const domain = target.getAttribute('data-domain') ?? '';
    const permanent = target.getAttribute('data-permanent') === 'true';
    const entryDiv = target.closest('.log-entry');

    if (!domain || !(entryDiv instanceof HTMLElement)) {
      return;
    }

    const indexAttr = entryDiv.getAttribute('data-entry-index');
    const entryIndex = indexAttr ? Number.parseInt(indexAttr, 10) : -1;

    if (Number.isNaN(entryIndex) || entryIndex < 0) {
      return;
    }

    target.setAttribute('disabled', 'true');

    const response = await dispatchSessionApprove(domain, permanent);

    if (!response.ok) {
      target.removeAttribute('disabled');
      console.error('Session approval failed', response.error);
      return;
    }

    applySessionApprovedToEntry(entryDiv, entryIndex);

    const sessionApprovedEl = document.getElementById('summary-session-approved');
    if (
      sessionApprovedEl instanceof HTMLElement &&
      typeof response.sessionApprovedCount === 'number'
    ) {
      sessionApprovedEl.innerText = String(response.sessionApprovedCount);
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const logDiv = document.getElementById('logs');
  const policySelect = document.getElementById('policy-mode');
  const allowlistInput = document.getElementById('allowlist-input');
  const saveButton = document.getElementById('save-settings');
  const settingsStatus = document.getElementById('settings-status');
  const audit = new AuditLog();
  const history = await audit.getHistory();

  if (
    !(logDiv instanceof HTMLElement) ||
    !(policySelect instanceof HTMLSelectElement) ||
    !(allowlistInput instanceof HTMLTextAreaElement) ||
    !(saveButton instanceof HTMLButtonElement) ||
    !(settingsStatus instanceof HTMLElement)
  ) {
    return;
  }

  await loadSettings(policySelect, allowlistInput);
  saveButton.addEventListener('click', async () => {
    try {
      await saveSettings(policySelect, allowlistInput, settingsStatus);
    } catch (error) {
      console.error('Failed to save settings', error);
      settingsStatus.innerText = 'Failed to save settings.';
    }
  });

  renderSummary(history);
  renderHistory(logDiv, history);
  attachTrustHandlers(logDiv);

  void fetchSessionApprovedCount().then((count) => renderSessionApprovedCount(count));
});
