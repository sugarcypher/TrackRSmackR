import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const HOST = '127.0.0.1';
const PORT = 4655;
const BASE_URL = `http://${HOST}:${PORT}`;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(timeoutMs = 12000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.ok) {
        const payload = await response.json();
        if (payload.ok === true) {
          return payload;
        }
      }
    } catch (_error) {
      // keep waiting
    }

    await delay(300);
  }

  throw new Error('Timed out waiting for device runtime health endpoint.');
}

async function runSmoke() {
  const daemon = spawn('node', ['device-runtime/daemon/index.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      TRACKR_DEVICE_HOST: HOST,
      TRACKR_DEVICE_PORT: String(PORT)
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let logs = '';
  daemon.stdout.on('data', (chunk) => {
    logs += chunk.toString('utf8');
  });
  daemon.stderr.on('data', (chunk) => {
    logs += chunk.toString('utf8');
  });

  try {
    const health = await waitForHealth();
    assert.equal(health.ok, true, 'Health endpoint should report ok=true.');

    const policyRes = await fetch(`${BASE_URL}/v1/policy`);
    const policyData = await policyRes.json();
    assert.equal(policyData.ok, true, 'Policy endpoint should return ok=true.');

    const patchRes = await fetch(`${BASE_URL}/v1/policy`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'balanced',
        invariants: {
          policyFloorMode: 'strict'
        }
      })
    });
    const patchData = await patchRes.json();

    assert.equal(patchData.ok, true, 'Policy update endpoint should return ok=true.');
    assert.equal(
      patchData.policy.mode,
      'strict',
      'Policy floor invariant should force strict mode after update.'
    );

    const eventRes = await fetch(`${BASE_URL}/v1/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'smoke.test',
        source: 'smoke-script',
        severity: 'info',
        detail: 'Smoke validation event.'
      })
    });
    const eventData = await eventRes.json();
    assert.equal(eventData.ok, true, 'Event ingest endpoint should return ok=true.');

    const listRes = await fetch(`${BASE_URL}/v1/events?limit=5`);
    const listData = await listRes.json();
    assert.equal(listData.ok, true, 'Event list endpoint should return ok=true.');
    assert.equal(
      listData.events.some((event) => event.type === 'smoke.test'),
      true,
      'Event list should include smoke test event.'
    );

    console.log(
      JSON.stringify(
        {
          baseUrl: BASE_URL,
          checks: {
            health: true,
            policyRead: true,
            policyInvariantFloor: true,
            eventIngest: true
          },
          passed: true
        },
        null,
        2
      )
    );
  } finally {
    daemon.kill('SIGTERM');
    await delay(250);
    if (daemon.exitCode === null) {
      daemon.kill('SIGKILL');
    }

    if (process.env.TRACKR_SMOKE_DEBUG === '1') {
      process.stderr.write(logs);
    }
  }
}

runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
