# TrackRSmackR

TrackRSmackR is a Manifest V3 Chromium extension implementing a local-only cookie control model:

- Intercept cookie changes
- Classify using local policy rules
- Contain in encrypted Vault or Quarantine jars
- Apply timed decay/smash for non-essential cookies
- Write local audit trails

## Manager + Workers

- `src/core/BouncerCore.ts`: manager/orchestrator
- `src/workers/CookieObserverWorker.ts`: cookie event intake
- `src/workers/ClassifierWorker.ts`: policy evaluation bridge
- `src/workers/CookieJarWorker.ts`: encrypted dual-jar store
- `src/workers/BlockerWorker.ts`: cookie removal
- `src/workers/TimerDecayWorker.ts`: alarm-based smash/decay
- `src/workers/AdaptationHunterWorker.ts`: evasion signals
- `src/workers/UIExplainerWorker.ts`: user-facing reason text

## Security Notes

- Cookie values are AES-GCM encrypted before storage (`src/utils/CryptoUtils.ts`)
- Vault key persists locally in extension storage
- Quarantine key is in-memory ephemeral
- Background startup enables a local-only runtime guard that blocks `fetch`

## Build

```bash
cd /Users/br14r/Documents/New\ project/TrackRSmackR
npm run build
```

## Test

```bash
cd /Users/br14r/Documents/New\ project/TrackRSmackR
npm test
npm run smoke:extension
npm run test:integration
```

Load unpacked extension from:

- `/Users/br14r/Documents/New project/TrackRSmackR/dist`
