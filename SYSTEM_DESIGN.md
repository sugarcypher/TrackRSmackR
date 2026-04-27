# TrackRSmackR System Design

## Architecture

TrackRSmackR uses a manager-worker model:

- Manager: `src/core/BouncerCore.ts`
- Workers:
  - `CookieObserverWorker` (cookie lifecycle intake)
  - `ClassifierWorker` (policy decision bridge)
  - `CookieJarWorker` (vault + quarantine encrypted storage)
  - `BlockerWorker` (cookie removal)
  - `TimerDecayWorker` (alarm-based timed decay / smash)
  - `AdaptationHunterWorker` (heuristic signals)
  - `DeceptionLabyrinthWorker` (exploit probe trap + deterministic sink routing)
  - `PatternDriftWorker` (recent-vs-baseline behavior drift detection)
  - `BehavioralFingerprintWorker` (fingerprint pressure modeling)
  - `ThreatModelWorker` (posture/trend synthesis)
  - `BrowserCapabilityWorker` (runtime compatibility scoring)
  - `PerformanceProfilerWorker` (pipeline latency instrumentation)
  - `UIExplainerWorker` (human-readable reasons)
- Content hardening:
  - `UniformPersonaContent` (uniform fingerprint persona injection, toggleable)

TrackRSmackR now also ships a device-runtime scaffold:

- `device-runtime/daemon`: loopback-only local daemon and policy API
- `device-runtime/desktop-ui`: local desktop control surface served by daemon
- `device-runtime/state`: persisted local policy/event files

## Data Flow

1. Observer receives `chrome.cookies.onChanged`
2. Deception + adaptation workers inspect metadata for exploit/fingerprint signals.
3. Classifier evaluates with precedence:
   - allowlist
   - essential session/auth
   - tracking signatures
   - unknown policy mode fallback (`DECAY` in balanced, `QUARANTINE` in strict)
4. BouncerCore enforces:
   - `ALLOW` -> vault backup
   - `QUARANTINE` -> immediate remove + quarantine + timed smash
   - `DECAY` -> quarantine + timed remove + smash
5. Audit log writes local event record and explanation
6. Intelligence layer computes:
   - drift alerts
   - recurring fingerprint pressure
   - deception probe hotspots
   - overall threat posture/trend
7. Performance/capability snapshots are updated locally for transparency and tuning.

Device runtime flow:

1. Local daemon exposes loopback-only endpoints (`/v1/policy`, `/v1/status`, `/v1/events`).
2. Policy updates are normalized and invariant-enforced before persistence.
3. Desktop UI reads/writes local policy and records operator notes in local event ledger.
4. Monitor stubs publish DNS/WebRTC/transport status snapshots for future OS-hook integration.

## Security Posture

- Local-only guard in background (`LocalOnlyGuard`) blocks network API usage.
- Cookie values encrypted with AES-GCM (`CryptoUtils`).
- Vault key persists locally; quarantine key is ephemeral in-memory.
- No remote telemetry path exists in extension runtime code.
- Uniform Persona Mode reduces entropy by standardizing selected fingerprint surfaces.

## Build Artifacts

Run:

```bash
cd /Users/br14r/Documents/New\\ project/TrackRSmackR
npm run build
```

Load unpacked extension from:

- `/Users/br14r/Documents/New project/TrackRSmackR/dist`

## Delivery and Funding Operations

- Execution plan: `FUNDING_EXECUTION_PLAN.md`
