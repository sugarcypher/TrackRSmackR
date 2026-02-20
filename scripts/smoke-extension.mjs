import http from 'node:http';
import { mkdtemp, rm, access } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { constants } from 'node:fs';
import { chromium } from 'playwright';

const EXTENSION_PATH = path.resolve(process.cwd(), 'dist');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensurePaths() {
  await access(EXTENSION_PATH, constants.R_OK);
}

function startTestServer() {
  const server = http.createServer((_, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><title>TrackRSmackR Smoke</title><h1>ok</h1>');
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to bind test server.'));
        return;
      }
      resolve({ server, url: `http://127.0.0.1:${address.port}/` });
    });
  });
}

async function storageClear(page) {
  await page.evaluate(() =>
    new Promise((resolve) => {
      chrome.storage.local.clear(() => resolve(null));
    })
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

async function storageGet(page, keys) {
  return page.evaluate(
    (requestedKeys) =>
      new Promise((resolve) => {
        chrome.storage.local.get(requestedKeys, (result) => resolve(result));
      }),
    keys
  );
}

function hasJarEntry(store, cookieName) {
  const keys = Object.keys(store ?? {});
  return keys.some((id) => id.endsWith(`|${cookieName}`));
}

function hasCookie(cookies, cookieName) {
  return cookies.some((cookie) => cookie.name === cookieName);
}

async function run() {
  await ensurePaths();

  const profileDir = await mkdtemp(path.join(tmpdir(), 'trackr-smackr-profile-'));
  const { server, url } = await startTestServer();
  let context;

  try {
    context = await chromium.launchPersistentContext(profileDir, {
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

    await storageClear(extensionPage);
    await storageSet(extensionPage, { policyMode: 'BALANCED', userAllowlist: [] });

    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    await context.addCookies([{ name: '_ga', value: 'GA1.2.12345', url }]);
    await delay(1200);

    let cookies = await context.cookies(url);
    let state = await storageGet(extensionPage, ['quarantineStore', 'vaultStore', 'auditLog']);

    const trackerCheck = {
      removed: !hasCookie(cookies, '_ga'),
      quarantined: hasJarEntry(state.quarantineStore, '_ga')
    };

    await context.addCookies([{ name: 'session_id', value: 'secret-session', url }]);
    await delay(1200);

    cookies = await context.cookies(url);
    state = await storageGet(extensionPage, ['quarantineStore', 'vaultStore', 'auditLog']);

    const essentialCheck = {
      present: hasCookie(cookies, 'session_id'),
      vaulted: hasJarEntry(state.vaultStore, 'session_id')
    };

    await context.addCookies([{ name: 'random_id', value: '123', url }]);
    await delay(1200);

    cookies = await context.cookies(url);
    state = await storageGet(extensionPage, ['quarantineStore', 'vaultStore', 'auditLog']);

    const auditLog = Array.isArray(state.auditLog) ? state.auditLog : [];
    const latestUnknownEntry = [...auditLog].reverse().find((entry) => entry.name === 'random_id');

    const unknownImmediateCheck = {
      actionIsDecay: latestUnknownEntry?.action === 'DECAY',
      initiallyPresent: hasCookie(cookies, 'random_id'),
      quarantined: hasJarEntry(state.quarantineStore, 'random_id')
    };

    await delay(32000);
    cookies = await context.cookies(url);
    state = await storageGet(extensionPage, ['quarantineStore', 'vaultStore', 'auditLog']);

    const unknownDecayFinalCheck = {
      removedAfterDecay: !hasCookie(cookies, 'random_id'),
      smashedAfterDecay: !hasJarEntry(state.quarantineStore, 'random_id')
    };

    const checks = {
      tracker: trackerCheck,
      essential: essentialCheck,
      unknownImmediate: unknownImmediateCheck,
      unknownFinal: unknownDecayFinalCheck
    };

    const passed =
      trackerCheck.removed &&
      trackerCheck.quarantined &&
      essentialCheck.present &&
      essentialCheck.vaulted &&
      unknownImmediateCheck.actionIsDecay &&
      unknownImmediateCheck.initiallyPresent &&
      unknownImmediateCheck.quarantined &&
      unknownDecayFinalCheck.removedAfterDecay &&
      unknownDecayFinalCheck.smashedAfterDecay;

    console.log(JSON.stringify({ extensionId, url, checks, passed }, null, 2));

    if (!passed) {
      process.exitCode = 1;
    }
  } finally {
    if (context) {
      await context.close();
    }
    await new Promise((resolve) => server.close(resolve));
    await rm(profileDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
