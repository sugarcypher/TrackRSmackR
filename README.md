# TrackRSmackR

`TrackRSmackR` is a standalone security module bundle with:

- a Manifest V3 browser extension runtime (local-first anti-tracking and policy enforcement),
- a local device-runtime scaffold (`device-runtime`) for host-level policy and monitoring,
- a standalone deception/maze module (`modules/deception-maze`),
- strategy, funding, and security planning docs.

## Extension Capabilities

- Intercept cookie changes
- Classify using local policy rules
- Contain in encrypted Vault or Quarantine jars
- Apply timed decay/smash for non-essential cookies
- Write local audit trails

## Manager + Workers

- `src/core/BouncerCore.ts`: manager/orchestrator
- `src/core/EventBus.ts`: local event envelope + message routing
- `src/workers/CookieObserverWorker.ts`: cookie event intake
- `src/workers/ClassifierWorker.ts`: policy evaluation bridge
- `src/workers/CookieJarWorker.ts`: encrypted dual-jar store
- `src/workers/BlockerWorker.ts`: cookie removal
- `src/workers/TimerDecayWorker.ts`: alarm-based smash/decay
- `src/workers/AdaptationHunterWorker.ts`: evasion signals
- `src/workers/PatternDriftWorker.ts`: pattern-drift analysis over recent/baseline windows
- `src/workers/BehavioralFingerprintWorker.ts`: recurring fingerprint pressure analysis
- `src/workers/ThreatModelWorker.ts`: posture/trend scoring from drift + behavior signals
- `src/workers/DeceptionLabyrinthWorker.ts`: exploit-probe canary detection + deterministic sink routes
- `src/workers/BrowserCapabilityWorker.ts`: browser/runtime compatibility scoring
- `src/workers/PerformanceProfilerWorker.ts`: in-engine latency and pressure profiling
- `src/workers/UIExplainerWorker.ts`: user-facing reason text
- `src/content/UniformPersonaContent.ts`: uniform anti-fingerprinting persona injection (toggleable)

## Security Notes

- Cookie values are AES-GCM encrypted before storage (`src/utils/CryptoUtils.ts`)
- Vault key persists locally in extension storage
- Quarantine key is in-memory ephemeral
- Background startup enables a local-only runtime guard that blocks `fetch`
- Audit events include policy reason, adaptation signals, drift key, deception route/type metadata, and enforcement outcome
- Uniform Persona Mode standardizes selected fingerprint surfaces to reduce per-user entropy.

## Build

```bash
cd /Users/br14r/Documents/New\\ project/TrackRSmackR
npm run build
```

## Test

```bash
cd /Users/br14r/Documents/New\\ project/TrackRSmackR
npm test
npm run smoke:extension
npm run test:integration
npm run test:coherence
```

## Device Runtime (Scaffold)

```bash
cd /Users/br14r/Documents/New\\ project/TrackRSmackR
npm run device:daemon
# then open http://127.0.0.1:4545/ui/
```

Smoke check:

```bash
cd /Users/br14r/Documents/New\\ project/TrackRSmackR
npm run device:smoke
```

Popup now includes an Intelligence Snapshot with:

- threat posture
- fingerprint-signal pressure
- drift alert summaries
- deception probe counts + top sink routes
- pipeline latency + pressure
- platform readiness + compatibility warnings.

## Strategy + Security Docs

- `docs/strategy/README.md`
- `docs/security/trackr-smackr-threat-model.md`
- `docs/security/trackr-smackr-security-roadmap.md`
- `docs/security/trackr-smackr-dependency-audit.md`

## Deception Module

- TypeScript package: `modules/deception-maze`
- Python microservice + engine: `modules/deception-maze/python`
- Service entrypoint: `modules/deception-maze/python/minos_service.py`

## Dependency Audit

```bash
cd /Users/br14r/Documents/New\\ project/TrackRSmackR
npm run audit:deps
```
