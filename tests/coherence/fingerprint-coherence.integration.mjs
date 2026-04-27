import assert from 'node:assert/strict';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { analyzeCoherenceSnapshot, loadCoherenceRules } from './coherence-detector.mjs';

const EXTENSION_PATH = path.resolve(process.cwd(), 'dist');
const RULES_PATH = path.resolve(process.cwd(), 'tests/coherence/fixtures/coherence-rules.json');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startServer() {
  const server = http.createServer((req, res) => {
    if (req.url && req.url.startsWith('/fingerprint-probe.js')) {
      res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8' });
      res.end('window.__fpProbeLoaded = true;');
      return;
    }

    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Lab.Coat Coherence Harness</title>
  </head>
  <body>
    <h1>Coherence Harness</h1>
    <form id="payment-form">
      <input name="account_number" autocomplete="cc-number" placeholder="Account Number" />
      <input type="password" name="password" autocomplete="current-password" placeholder="Password" />
    </form>
    <canvas id="coherence-canvas" width="320" height="120"></canvas>
    <script>
      window.__fpProbeLoaded = false;
      document.addEventListener('DOMContentLoaded', () => {
        const canvas = document.getElementById('coherence-canvas');
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#101820';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = '#f2aa4c';
          ctx.font = '24px monospace';
          ctx.fillText('lab-coat-coherence-probe', 8, 64);
        }

        const injectProbeWhenPersonaReady = () => {
          const markerReady =
            document.documentElement &&
            document.documentElement.hasAttribute('__trackr_uniform_persona_applied__');

          if (!markerReady) {
            window.setTimeout(injectProbeWhenPersonaReady, 50);
            return;
          }

          const script = document.createElement('script');
          script.src = '/fingerprint-probe.js?fingerprint=1';
          document.head.appendChild(script);
        };

        injectProbeWhenPersonaReady();
      });
    </script>
  </body>
</html>`);
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to bind local coherence harness server.'));
        return;
      }

      resolve({ server, url: `http://127.0.0.1:${address.port}/` });
    });
  });
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

async function collectFingerprintSnapshot(page) {
  return page.evaluate(async () => {
    const defense = typeof window.__labCoatDefense === 'object' ? window.__labCoatDefense : null;

    const canvas = document.getElementById('coherence-canvas') || document.createElement('canvas');
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error('Coherence canvas missing from probe page.');
    }

    const hashes = [];
    for (let index = 0; index < 5; index += 1) {
      hashes.push(canvas.toDataURL('image/png'));
    }

    const webglCanvas = document.createElement('canvas');
    const gl =
      webglCanvas.getContext('webgl') || webglCanvas.getContext('experimental-webgl') || null;

    let webglVendor = null;
    let webglRenderer = null;
    let glVendor = null;
    let glVersion = null;
    let debugRendererInfoExposed = false;

    if (gl) {
      webglVendor = gl.getParameter(37445);
      webglRenderer = gl.getParameter(37446);
      glVendor = gl.getParameter(7936);
      glVersion = gl.getParameter(7937);
      debugRendererInfoExposed = Boolean(gl.getExtension('WEBGL_debug_renderer_info'));
    }

    let uaHighEntropy = null;
    if (navigator.userAgentData && typeof navigator.userAgentData.getHighEntropyValues === 'function') {
      uaHighEntropy = await navigator.userAgentData.getHighEntropyValues([
        'architecture',
        'bitness',
        'model',
        'platform',
        'platformVersion',
        'uaFullVersion',
        'fullVersionList'
      ]);
    }

    return {
      navigator: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        languages: Array.isArray(navigator.languages) ? [...navigator.languages] : [],
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemory: navigator.deviceMemory,
        doNotTrack: navigator.doNotTrack,
        webdriver: navigator.webdriver,
        maxTouchPoints: navigator.maxTouchPoints,
        userAgentData: navigator.userAgentData
          ? {
              brands: Array.isArray(navigator.userAgentData.brands)
                ? navigator.userAgentData.brands.map((item) => ({ ...item }))
                : [],
              mobile: navigator.userAgentData.mobile,
              platform: navigator.userAgentData.platform,
              highEntropy: uaHighEntropy
            }
          : null
      },
      intl: {
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timezoneOffset: new Date().getTimezoneOffset()
      },
      screen: {
        colorDepth: screen.colorDepth,
        pixelDepth: screen.pixelDepth,
        devicePixelRatio: window.devicePixelRatio
      },
      webgl: {
        vendor: webglVendor,
        renderer: webglRenderer,
        glVendor,
        glVersion,
        debugRendererInfoExposed
      },
      canvas: {
        hashes,
        uniqueHashes: Array.from(new Set(hashes)).length
      },
      defense,
      probe: {
        fingerprintScriptLoaded: Boolean(window.__fpProbeLoaded),
        blockedScripts: defense && typeof defense.blockedScripts === 'number' ? defense.blockedScripts : 0
      },
      diagnostics: {
        personaMarkerPresent: Boolean(
          document.documentElement &&
            document.documentElement.hasAttribute('__trackr_uniform_persona_applied__')
        ),
        defensePresent: Boolean(defense)
      }
    };
  });
}

async function run() {
  await access(EXTENSION_PATH, constants.R_OK);
  const rules = await loadCoherenceRules(RULES_PATH);

  const profileDir = await mkdtemp(path.join(tmpdir(), 'labcoat-coherence-profile-'));
  const { server, url } = await startServer();
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
    await storageSet(extensionPage, {
      policyMode: 'BALANCED',
      userAllowlist: [],
      tutorSwarmAutopilotEnabled: false,
      contextPolicyEnabled: false,
      contextPolicyRules: [],
      uniformPersonaEnabled: true,
      personaEntropyNormalizationEnabled: true,
      personaScriptBlocklistEnabled: true,
      policyInvariantFloorMode: 'BALANCED',
      policyInvariantDomainBlocklist: [],
      policyInvariantEnforcePersona: true
    });

    const probePage = await context.newPage();
    const pageErrors = [];
    const consoleErrors = [];
    probePage.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });
    probePage.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });
    await probePage.goto(url, { waitUntil: 'domcontentloaded' });
    await delay(1500);

    const snapshot = await collectFingerprintSnapshot(probePage);
    const analysis = analyzeCoherenceSnapshot(snapshot, rules);

    const report = {
      harness: 'fingerprint-coherence',
      ruleset: rules.name,
      passed: analysis.passed,
      metrics: analysis.metrics,
      failures: analysis.failures,
      sample: {
        userAgent: snapshot.navigator.userAgent,
        platform: snapshot.navigator.platform,
        timeZone: snapshot.intl.timeZone,
        timezoneOffset: snapshot.intl.timezoneOffset,
        webglVendor: snapshot.webgl.vendor,
        webglRenderer: snapshot.webgl.renderer,
        canvasUniqueHashes: snapshot.canvas.uniqueHashes,
        blockedScripts: snapshot.probe.blockedScripts,
        personaMarkerPresent: snapshot.diagnostics.personaMarkerPresent,
        defensePresent: snapshot.diagnostics.defensePresent,
        personaProfileId: snapshot.defense?.personaProfileId ?? null,
        personaCoherenceScore: snapshot.defense?.personaCoherenceScore ?? null,
        personaContradictions: snapshot.defense?.personaContradictions ?? [],
        pageErrors,
        consoleErrors
      }
    };

    console.log(JSON.stringify(report, null, 2));
    if (!analysis.passed) {
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
