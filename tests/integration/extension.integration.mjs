import assert from 'node:assert/strict';
import http from 'node:http';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';

const EXTENSION_PATH = path.resolve(process.cwd(), 'dist');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startServer() {
  const server = http.createServer((_, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><title>TrackRSmackR Integration</title><h1>ok</h1>');
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to bind local integration server.'));
        return;
      }
      resolve({ server, url: `http://127.0.0.1:${address.port}/` });
    });
  });
}

async function storageGet(page, keys) {
  return page.evaluate(
    (requestedKeys) =>
      new Promise((resolve) => {
        chrome.storage.local.get(requestedKeys, (result) => resolve(result));
      }),
    keys
  );
}

async function storageSet(page, payload) {
  await page.evaluate(
    (items) =>
      new Promise((resolve) => {
        chrome.storage.local.set(items, () => resolve(null));
      }),
    payload
  );
}

async function storageClear(page) {
  await page.evaluate(() =>
    new Promise((resolve) => {
      chrome.storage.local.clear(() => resolve(null));
    })
  );
}

function findJarEntry(store, cookieName) {
  const entries = Object.entries(store ?? {});
  return entries.find(([id]) => id.endsWith(`|${cookieName}`));
}

async function bootstrap() {
  await access(EXTENSION_PATH, constants.R_OK);

  const profileDir = await mkdtemp(path.join(tmpdir(), 'trackr-smackr-integration-'));
  const { server, url } = await startServer();

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-first-run',
      '--no-default-browser-check'
    ]
  });

  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker', { timeout: 15000 });
  }

  const extensionId = new URL(serviceWorker.url()).host;

  const extensionPage = await context.newPage();
  await extensionPage.goto(`chrome-extension://${extensionId}/static/popup.html`, {
    waitUntil: 'domcontentloaded'
  });

  const testPage = await context.newPage();
  await testPage.goto(url, { waitUntil: 'domcontentloaded' });

  await storageClear(extensionPage);
  await storageSet(extensionPage, { policyMode: 'BALANCED', userAllowlist: [] });

  return { context, serviceWorker, extensionPage, testPage, url, profileDir, server };
}

async function cleanup(resources) {
  await resources.context.close();
  await new Promise((resolve) => resources.server.close(resolve));
  await rm(resources.profileDir, { recursive: true, force: true });
}

async function testLocalOnlyGuard(serviceWorker) {
  const message = await serviceWorker.evaluate(async () => {
    try {
      await fetch('https://example.com');
      return 'unexpected-success';
    } catch (error) {
      return String(error instanceof Error ? error.message : error);
    }
  });

  assert.notEqual(
    message,
    'unexpected-success',
    'Background fetch should be blocked by local-only runtime guard.'
  );
  assert.match(
    message,
    /local-only guard blocked/i,
    'Expected local-only guard error message when fetch is attempted in background.'
  );
}

async function testPopupSettingsRoundTrip(extensionPage) {
  await extensionPage.selectOption('#policy-mode', 'STRICT');
  await extensionPage.setChecked('#tutor-swarm-autopilot-toggle', false);
  await extensionPage.setChecked('#context-policy-toggle', true);
  await extensionPage.setChecked('#context-breakage-toggle', true);
  await extensionPage.fill('#context-breakage-threshold', '6');
  await extensionPage.fill('#context-rules-input', '*.bank.example=STRICT\n*.shop.example=BALANCED');
  await extensionPage.selectOption('#policy-floor-mode', 'STRICT');
  await extensionPage.fill('#policy-floor-blocklist', 'tracker.example\nads.example\ntracker.example');
  await extensionPage.fill('#allowlist-input', 'Example.COM\naccounts.google.com\nexample.com');
  await extensionPage.setChecked('#uniform-persona-toggle', false);
  await extensionPage.setChecked('#entropy-normalization-toggle', false);
  await extensionPage.setChecked('#script-blocklist-toggle', true);
  await extensionPage.setChecked('#anti-regeneration-toggle', true);
  await extensionPage.setChecked('#aggressive-strip-toggle', true);
  await extensionPage.click('#save-settings');
  await extensionPage.waitForFunction(
    () => {
      const status = document.querySelector('#settings-status');
      return Boolean(status && status.textContent && status.textContent.includes('Saved'));
    },
    null,
    { timeout: 5000 }
  );

  const state = await storageGet(extensionPage, [
    'policyMode',
    'userAllowlist',
    'tutorSwarmAutopilotEnabled',
    'contextPolicyEnabled',
    'contextBreakageAdaptiveEnabled',
    'contextBreakageRelaxThreshold',
    'contextPolicyRules',
    'policyInvariantFloorMode',
    'policyInvariantDomainBlocklist',
    'uniformPersonaEnabled',
    'personaEntropyNormalizationEnabled',
    'personaScriptBlocklistEnabled',
    'antiRegenerationEnabled',
    'aggressiveSetCookieStripEnabled'
  ]);
  assert.equal(state.policyMode, 'STRICT', 'Popup save should persist STRICT mode.');
  assert.deepEqual(
    state.userAllowlist,
    ['example.com', 'accounts.google.com'],
    'Popup save should normalize and de-duplicate allowlist entries.'
  );
  assert.equal(
    state.tutorSwarmAutopilotEnabled,
    false,
    'Popup save should persist Tutor Swarm autopilot toggle state.'
  );
  assert.equal(state.contextPolicyEnabled, true, 'Popup save should persist context policy toggle state.');
  assert.equal(
    state.contextBreakageAdaptiveEnabled,
    true,
    'Popup save should persist context breakage adaptation toggle state.'
  );
  assert.equal(
    state.contextBreakageRelaxThreshold,
    6,
    'Popup save should persist context breakage relax threshold.'
  );
  assert.deepEqual(
    state.contextPolicyRules,
    [
      { pattern: '*.bank.example', mode: 'STRICT' },
      { pattern: '*.shop.example', mode: 'BALANCED' }
    ],
    'Popup save should persist context policy rules.'
  );
  assert.equal(
    state.policyInvariantFloorMode,
    'STRICT',
    'Popup save should persist policy floor mode state.'
  );
  assert.deepEqual(
    state.policyInvariantDomainBlocklist,
    ['tracker.example', 'ads.example'],
    'Popup save should normalize and dedupe policy floor blocklist.'
  );
  assert.equal(
    state.uniformPersonaEnabled,
    true,
    'Persona invariant should force-enable uniform persona mode.'
  );
  assert.equal(
    state.personaEntropyNormalizationEnabled,
    true,
    'Persona invariant should force-enable entropy normalization.'
  );
  assert.equal(
    state.personaScriptBlocklistEnabled,
    true,
    'Popup save should persist script blocklist toggle state.'
  );
  assert.equal(
    state.antiRegenerationEnabled,
    true,
    'Popup save should persist anti-regeneration toggle state.'
  );
  assert.equal(
    state.aggressiveSetCookieStripEnabled,
    true,
    'Popup save should persist aggressive Set-Cookie strip toggle state.'
  );

  await extensionPage.reload({ waitUntil: 'domcontentloaded' });
  const uiState = await extensionPage.evaluate(() => {
    const policyMode = document.querySelector('#policy-mode')?.value ?? null;
    const tutorSwarmAutopilotEnabled =
      document.querySelector('#tutor-swarm-autopilot-toggle')?.checked ?? null;
    const contextPolicyEnabled = document.querySelector('#context-policy-toggle')?.checked ?? null;
    const contextBreakageAdaptiveEnabled =
      document.querySelector('#context-breakage-toggle')?.checked ?? null;
    const contextBreakageRelaxThreshold =
      document.querySelector('#context-breakage-threshold')?.value ?? null;
    const contextRules = document.querySelector('#context-rules-input')?.value ?? '';
    const policyFloorMode = document.querySelector('#policy-floor-mode')?.value ?? null;
    const policyFloorBlocklist = document.querySelector('#policy-floor-blocklist')?.value ?? '';
    const allowlistText = document.querySelector('#allowlist-input')?.value ?? '';
    const uniformPersonaEnabled =
      document.querySelector('#uniform-persona-toggle')?.checked ?? null;
    const entropyNormalizationEnabled =
      document.querySelector('#entropy-normalization-toggle')?.checked ?? null;
    const scriptBlocklistEnabled =
      document.querySelector('#script-blocklist-toggle')?.checked ?? null;
    const antiRegenerationEnabled =
      document.querySelector('#anti-regeneration-toggle')?.checked ?? null;
    const aggressiveSetCookieStripEnabled =
      document.querySelector('#aggressive-strip-toggle')?.checked ?? null;
    return {
      policyMode,
      tutorSwarmAutopilotEnabled,
      contextPolicyEnabled,
      contextBreakageAdaptiveEnabled,
      contextBreakageRelaxThreshold,
      contextRules,
      policyFloorMode,
      policyFloorBlocklist,
      allowlistText,
      uniformPersonaEnabled,
      entropyNormalizationEnabled,
      scriptBlocklistEnabled,
      antiRegenerationEnabled,
      aggressiveSetCookieStripEnabled
    };
  });

  assert.equal(uiState.policyMode, 'STRICT', 'Popup should restore saved policy mode on reload.');
  assert.equal(
    uiState.tutorSwarmAutopilotEnabled,
    false,
    'Popup should restore Tutor Swarm autopilot toggle state on reload.'
  );
  assert.equal(
    uiState.contextPolicyEnabled,
    true,
    'Popup should restore context policy toggle state on reload.'
  );
  assert.equal(
    uiState.contextBreakageAdaptiveEnabled,
    true,
    'Popup should restore breakage adaptation toggle state on reload.'
  );
  assert.equal(
    uiState.contextBreakageRelaxThreshold,
    '6',
    'Popup should restore breakage relaxation threshold on reload.'
  );
  assert.equal(
    uiState.contextRules,
    '*.bank.example=STRICT\n*.shop.example=BALANCED',
    'Popup should restore context rules on reload.'
  );
  assert.equal(uiState.policyFloorMode, 'STRICT', 'Popup should restore policy floor mode on reload.');
  assert.equal(
    uiState.policyFloorBlocklist,
    'tracker.example\nads.example',
    'Popup should restore normalized policy floor blocklist on reload.'
  );
  assert.equal(
    uiState.allowlistText,
    'example.com\naccounts.google.com',
    'Popup should restore saved allowlist on reload.'
  );
  assert.equal(
    uiState.uniformPersonaEnabled,
    true,
    'Popup should reflect invariant-enforced uniform persona state on reload.'
  );
  assert.equal(
    uiState.entropyNormalizationEnabled,
    true,
    'Popup should reflect invariant-enforced entropy normalization state on reload.'
  );
  assert.equal(
    uiState.scriptBlocklistEnabled,
    true,
    'Popup should restore script blocklist toggle state on reload.'
  );
  assert.equal(
    uiState.antiRegenerationEnabled,
    true,
    'Popup should restore anti-regeneration toggle state on reload.'
  );
  assert.equal(
    uiState.aggressiveSetCookieStripEnabled,
    true,
    'Popup should restore aggressive strip toggle state on reload.'
  );
}

async function testPopupIntelligenceVisibility(extensionPage) {
  const now = Date.now();
  const auditSeed = [
    {
      timestamp: now - 3000,
      domain: 'tracker.example',
      name: 'fp_uid',
      action: 'QUARANTINE',
      reason: 'Signature Match: Known Tracker',
      eventType: 'COOKIE_DECISION',
      policyReason: 'Signature Match: Known Tracker',
      explanation: 'Known tracker quarantined.',
      adaptationSignals: ['Possible fingerprint identifier'],
      outcome: 'REMOVED_AND_QUARANTINED',
      driftKey: 'tracker.example|QUARANTINE|possible fingerprint identifier'
    },
    {
      timestamp: now - 2000,
      domain: 'tracker.example',
      name: 'fp_uid',
      action: 'QUARANTINE',
      reason: 'Signature Match: Known Tracker',
      eventType: 'COOKIE_DECISION',
      policyReason: 'Signature Match: Known Tracker',
      explanation: 'Known tracker quarantined.',
      adaptationSignals: ['Possible fingerprint identifier'],
      outcome: 'REMOVED_AND_QUARANTINED',
      driftKey: 'tracker.example|QUARANTINE|possible fingerprint identifier'
    },
    {
      timestamp: now - 1000,
      domain: 'tracker.example',
      name: 'fp_uid',
      action: 'QUARANTINE',
      reason: 'Signature Match: Known Tracker',
      eventType: 'COOKIE_DECISION',
      policyReason: 'Signature Match: Known Tracker',
      explanation: 'Known tracker quarantined.',
      adaptationSignals: ['Possible fingerprint identifier'],
      outcome: 'REMOVED_AND_QUARANTINED',
      driftKey: 'tracker.example|QUARANTINE|possible fingerprint identifier'
    }
  ];

  await storageSet(extensionPage, { auditLog: auditSeed });
  await extensionPage.reload({ waitUntil: 'domcontentloaded' });
  await extensionPage.waitForFunction(
    () => {
      const posture = document.querySelector('#summary-posture')?.textContent?.trim();
      return Boolean(posture && posture !== '-');
    },
    null,
    { timeout: 5000 }
  );

  const uiState = await extensionPage.evaluate(() => {
    const posture = document.querySelector('#summary-posture')?.textContent?.trim() ?? '';
    const fingerprint = document.querySelector('#summary-fingerprint')?.textContent?.trim() ?? '';
    const driftCount = document.querySelector('#summary-drift-count')?.textContent?.trim() ?? '';
    const deceptionCount = document.querySelector('#summary-deception')?.textContent?.trim() ?? '';
    const latency = document.querySelector('#summary-latency')?.textContent?.trim() ?? '';
    const readiness = document.querySelector('#summary-readiness')?.textContent?.trim() ?? '';
    const driftItems = Array.from(
      document.querySelectorAll('#summary-drift-list li')
    ).map((item) => item.textContent ?? '');
    const deceptionItems = Array.from(
      document.querySelectorAll('#summary-deception-list li')
    ).map((item) => item.textContent ?? '');
    const compatibilityItems = Array.from(
      document.querySelectorAll('#summary-compat-list li')
    ).map((item) => item.textContent ?? '');
    const firstLog = document.querySelector('#logs .log-entry')?.textContent ?? '';

    return {
      posture,
      fingerprint,
      driftCount,
      deceptionCount,
      latency,
      readiness,
      driftItems,
      deceptionItems,
      compatibilityItems,
      firstLog
    };
  });

  assert.notEqual(uiState.posture, '-', 'Popup should render computed threat posture.');
  assert.equal(uiState.fingerprint, '3', 'Popup should count fingerprint-linked adaptation signals.');
  assert.equal(uiState.driftCount, '1', 'Popup should surface one drift alert for repeated pattern.');
  assert.equal(uiState.deceptionCount, '0', 'Popup should show zero deception probes when none exist.');
  assert.match(
    uiState.deceptionItems[0] ?? '',
    /no deception probes trapped yet/i,
    'Popup should render default deception route message when empty.'
  );
  assert.equal(uiState.latency, '-', 'Popup should show unknown latency when no performance samples exist.');
  assert.equal(uiState.readiness, '-', 'Popup should show unknown readiness when no capability snapshot exists.');
  assert.match(
    uiState.compatibilityItems[0] ?? '',
    /no compatibility warnings/i,
    'Popup should render default compatibility message when warnings are absent.'
  );
  assert.match(uiState.driftItems[0] ?? '', /tracker\.example/i, 'Drift alert should include domain context.');
  assert.match(uiState.firstLog, /Possible fingerprint identifier/i, 'Recent activity should include adaptation signals.');
}

async function testPopupTutorSwarmVisibility(extensionPage) {
  const now = Date.now();
  await storageSet(extensionPage, {
    intelligenceSummary: {
      posture: 'GUARDED',
      trend: 'STEADY',
      score: 8,
      driftCount: 1,
      topDriftAlerts: [],
      fingerprintSignals: 2,
      recurringFingerprintDomains: ['tracker.example'],
      deceptionProbes: 0,
      deceptionRouteHotspots: [],
      severeActions: 1,
      modelVersion: 2,
      source: 'engine',
      updatedAt: now,
      tutorSwarm: {
        signal: 'INTERVENE_ADJUST_PARAMS',
        complianceMessage: 'Divergence Threshold Breach',
        diagnosis: 'Overfitting Detected',
        interventionAction: 'PARAMS_ADJUSTED',
        slopeTrain: 0.01,
        slopeVal: -0.004,
        divergenceGap: 0.2,
        adaptationZone: true,
        securityLevel: 'HIGH',
        metric: {
          iteration: 6,
          trainAcc: 0.82,
          valAcc: 0.62,
          loss: 0.56,
          timestamp: now
        },
        successfulAdaptations: 3,
        blockedThreats: 2,
        updatedAt: now
      }
    }
  });

  await extensionPage.reload({ waitUntil: 'domcontentloaded' });
  await extensionPage.waitForFunction(
    () => {
      const signal = document.querySelector('#summary-swarm-signal')?.textContent?.trim();
      return Boolean(signal && signal !== '-');
    },
    null,
    { timeout: 5000 }
  );

  const uiState = await extensionPage.evaluate(() => ({
    signal: document.querySelector('#summary-swarm-signal')?.textContent?.trim() ?? '',
    action: document.querySelector('#summary-swarm-action')?.textContent?.trim() ?? '',
    detail: document.querySelector('#summary-swarm-detail')?.textContent?.trim() ?? ''
  }));

  assert.equal(
    uiState.signal,
    'INTERVENE_ADJUST_PARAMS',
    'Popup should surface stored Tutor Swarm governance signal.'
  );
  assert.equal(
    uiState.action,
    'PARAMS_ADJUSTED',
    'Popup should surface stored Tutor Swarm intervention action.'
  );
  assert.match(
    uiState.detail,
    /Divergence Threshold Breach/i,
    'Popup should render Tutor Swarm compliance detail.'
  );
}

async function testVaultEncryption(extensionPage, context, url) {
  const plainValue = 'secret-session-value';
  await context.addCookies([{ name: 'session_id', value: plainValue, url }]);
  await delay(1200);

  const state = await storageGet(extensionPage, ['vaultStore']);
  const entry = findJarEntry(state.vaultStore, 'session_id');

  assert.ok(entry, 'Expected session cookie entry in vault store.');

  const jarEntry = entry[1];
  assert.ok(typeof jarEntry.encryptedValue === 'string', 'Vault entry must contain encryptedValue.');
  assert.notEqual(
    jarEntry.encryptedValue,
    plainValue,
    'Vault encryptedValue must not equal raw cookie value.'
  );
  assert.equal(
    jarEntry.encryptedValue.includes(plainValue),
    false,
    'Vault encryptedValue must not contain raw cookie value text.'
  );
}

async function testQuarantineDecaySmash(extensionPage, context, url) {
  await context.addCookies([{ name: 'random_id', value: '123', url }]);
  await delay(1200);

  let state = await storageGet(extensionPage, ['quarantineStore']);
  const immediateEntry = findJarEntry(state.quarantineStore, 'random_id');
  assert.ok(immediateEntry, 'Expected unknown cookie in quarantine store before decay smash.');

  await delay(32000);

  state = await storageGet(extensionPage, ['quarantineStore']);
  const finalEntry = findJarEntry(state.quarantineStore, 'random_id');
  assert.equal(finalEntry, undefined, 'Expected quarantine entry to be smashed after decay window.');
}

async function run() {
  const resources = await bootstrap();

  try {
    await testPopupSettingsRoundTrip(resources.extensionPage);
    console.log('PASS popup settings save and reload');

    await testPopupIntelligenceVisibility(resources.extensionPage);
    console.log('PASS popup intelligence and drift visibility');

    await testPopupTutorSwarmVisibility(resources.extensionPage);
    console.log('PASS popup tutor swarm visibility');

    await testLocalOnlyGuard(resources.serviceWorker);
    console.log('PASS local-only guard blocks background network');

    await testVaultEncryption(resources.extensionPage, resources.context, resources.url);
    console.log('PASS vault values are encrypted at rest');

    await testQuarantineDecaySmash(resources.extensionPage, resources.context, resources.url);
    console.log('PASS quarantine entries decay and smash as expected');

    console.log('Integration suite passed');
  } finally {
    await cleanup(resources);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
