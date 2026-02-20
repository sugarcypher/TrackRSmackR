import { AuditLog } from '../core/AuditLog.js';

type PopupSettings = {
  policyMode?: string;
  userAllowlist?: string[];
};

function normalizeAllowlist(raw: string): string[] {
  const values = raw
    .split(/[\n,]/)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
  return Array.from(new Set(values));
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

document.addEventListener('DOMContentLoaded', async () => {
  const logDiv = document.getElementById('logs');
  const policySelect = document.getElementById('policy-mode');
  const allowlistInput = document.getElementById('allowlist-input');
  const saveButton = document.getElementById('save-settings');
  const settingsStatus = document.getElementById('settings-status');
  const audit = new AuditLog();
  const history = await audit.getHistory();

  if (
    !logDiv ||
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

  if (history.length === 0) {
    logDiv.innerText = 'No tracking events detected yet.';
    return;
  }

  const recentEntries = history.slice(-10).reverse();
  logDiv.innerHTML = recentEntries
    .map(
      (entry) => `<div class="log-entry">
          <strong>${entry.action}</strong>: ${entry.name}<br>
          <small>${entry.domain}</small>
        </div>`
    )
    .join('');
});
