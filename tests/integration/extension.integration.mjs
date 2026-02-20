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
  await extensionPage.fill('#allowlist-input', 'Example.COM\naccounts.google.com\nexample.com');
  await extensionPage.click('#save-settings');
  await extensionPage.waitForFunction(
    () => {
      const status = document.querySelector('#settings-status');
      return Boolean(status && status.textContent && status.textContent.includes('Saved'));
    },
    null,
    { timeout: 5000 }
  );

  const state = await storageGet(extensionPage, ['policyMode', 'userAllowlist']);
  assert.equal(state.policyMode, 'STRICT', 'Popup save should persist STRICT mode.');
  assert.deepEqual(
    state.userAllowlist,
    ['example.com', 'accounts.google.com'],
    'Popup save should normalize and de-duplicate allowlist entries.'
  );

  await extensionPage.reload({ waitUntil: 'domcontentloaded' });
  const uiState = await extensionPage.evaluate(() => {
    const policyMode = document.querySelector('#policy-mode')?.value ?? null;
    const allowlistText = document.querySelector('#allowlist-input')?.value ?? '';
    return { policyMode, allowlistText };
  });

  assert.equal(uiState.policyMode, 'STRICT', 'Popup should restore saved policy mode on reload.');
  assert.equal(
    uiState.allowlistText,
    'example.com\naccounts.google.com',
    'Popup should restore saved allowlist on reload.'
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
