#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'cakecookies');
const NOW = Date.now();
const PERSISTENCE_DAYS = 365;
const EXPIRES_AT = NOW + PERSISTENCE_DAYS * 24 * 60 * 60 * 1000;

const BLUEPRINTS = [
  { fileName: '_ga.cookie.json', cookieName: '_ga', domain: '.analytics.edge' },
  { fileName: '_gid.cookie.json', cookieName: '_gid', domain: '.metrics.edge' },
  { fileName: '_fbp.cookie.json', cookieName: '_fbp', domain: '.social-pixel.edge' },
  { fileName: 'IDE.cookie.json', cookieName: 'IDE', domain: '.ad-broker.edge' },
  { fileName: 'uid.cookie.json', cookieName: 'uid', domain: '.identity-broker.edge' },
  { fileName: 'visitor_id.cookie.json', cookieName: 'visitor_id', domain: '.traffic-pulse.edge' },
  { fileName: 'session_replay.cookie.json', cookieName: 'session_replay', domain: '.replay-edge.local' },
  { fileName: 'amplitude_id.cookie.json', cookieName: 'amplitude_id', domain: '.events-edge.local' },
  { fileName: 'mixpanel_distinct_id.cookie.json', cookieName: 'mixpanel_distinct_id', domain: '.cohort-edge.local' },
  { fileName: 'ajs_anonymous_id.cookie.json', cookieName: 'ajs_anonymous_id', domain: '.funnel-edge.local' }
];

const LAYERS = ['browser', 'policy', 'vault', 'quarantine', 'system-frontier'];

function fakeValue(stage, index) {
  const label = `${stage.toUpperCase()}-${String(index + 1).padStart(3, '0')}`;
  return `VOID-${label}-00000000000000000000`;
}

function buildRecord(stage, blueprint, index) {
  return {
    fileCode: 'cakecookies',
    stage,
    cookieName: blueprint.cookieName,
    domain: blueprint.domain,
    path: '/',
    value: fakeValue(stage, index),
    sameSite: 'Lax',
    secure: true,
    httpOnly: false,
    createdAt: NOW,
    refreshedAt: NOW,
    expiresAt: EXPIRES_AT,
    persistenceDays: PERSISTENCE_DAYS,
    dataClass: 'decoy',
    note: 'Stunt-double cookie payload. Deliberately information-void.'
  };
}

async function writeLayer(stage) {
  const layerPath = path.join(ROOT, stage);
  await mkdir(layerPath, { recursive: true });

  const writes = BLUEPRINTS.map(async (blueprint, index) => {
    const record = buildRecord(stage, blueprint, index);
    const target = path.join(layerPath, blueprint.fileName);
    await writeFile(target, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  });

  await Promise.all(writes);
}

async function writeManifest() {
  const manifest = {
    codeName: 'cakecookies',
    generatedAt: NOW,
    expiresAt: EXPIRES_AT,
    persistenceDays: PERSISTENCE_DAYS,
    layers: LAYERS,
    filesPerLayer: BLUEPRINTS.length,
    purpose: 'Decoy cookie frontier for exfiltration canary defense.'
  };

  await writeFile(path.join(ROOT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await writeFile(
    path.join(ROOT, 'README.md'),
    `# cakecookies\n\n` +
      `Decoy cookie files for defensive canary use.\n\n` +
      `- Generated at: ${new Date(NOW).toISOString()}\n` +
      `- Layers: ${LAYERS.join(', ')}\n` +
      `- Files per layer: ${BLUEPRINTS.length}\n` +
      `- Payloads are intentionally information-void and persistence-marked.\n`,
    'utf8'
  );
}

async function main() {
  await mkdir(ROOT, { recursive: true });
  for (const layer of LAYERS) {
    await writeLayer(layer);
  }
  await writeManifest();
  process.stdout.write(`cakecookies refreshed at ${new Date(NOW).toISOString()}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
