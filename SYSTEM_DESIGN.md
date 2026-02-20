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
  - `UIExplainerWorker` (human-readable reasons)

## Data Flow

1. Observer receives `chrome.cookies.onChanged`
2. Classifier evaluates with precedence:
   - allowlist
   - essential session/auth
   - tracking signatures
   - unknown policy mode fallback (`DECAY` in balanced, `QUARANTINE` in strict)
3. BouncerCore enforces:
   - `ALLOW` -> vault backup
   - `QUARANTINE` -> immediate remove + quarantine + timed smash
   - `DECAY` -> quarantine + timed remove + smash
4. Audit log writes local event record and explanation

## Security Posture

- Local-only guard in background (`LocalOnlyGuard`) blocks network API usage.
- Cookie values encrypted with AES-GCM (`CryptoUtils`).
- Vault key persists locally; quarantine key is ephemeral in-memory.
- No remote telemetry path exists in extension runtime code.

## Build Artifacts

Run:

```bash
cd /Users/br14r/Documents/New\ project/TrackRSmackR
npm run build
```

Load unpacked extension from:

- `/Users/br14r/Documents/New project/TrackRSmackR/dist`
